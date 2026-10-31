import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { db } from '../utils/db';
import { ingestHistoryItem } from '../utils/history/collect';
import { getVaultEpoch } from '../utils/history/epoch';
import {
  clearVaultData,
  deleteDayFromVault,
  deleteUrlFromVault,
  getVaultCounts,
  removeInferredRedirectVisits,
  removeSupersededSameDocumentVisits,
} from '../utils/history/query';
import type { PageRecord, VisitRecord } from '../utils/history/types';

const history = {
  search: vi.fn(),
  getVisits: vi.fn(),
};

Object.assign(fakeBrowser, { history });

function page(url: string, lastVisitTime: number): PageRecord {
  return {
    url,
    title: url,
    host: new URL(url).host,
    titleLower: url,
    urlLower: url,
    lastVisitTime,
    firstVisitTime: lastVisitTime,
    visitCount: 1,
  };
}

function visit(id: string, url: string, visitedAt: number): VisitRecord {
  return {
    id,
    url,
    host: new URL(url).host,
    visitedAt,
    transition: 'link',
    source: 'live',
  };
}

describe('vault maintenance', () => {
  beforeEach(async () => {
    await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
    history.search.mockReset();
    history.getVisits.mockReset();
    history.getVisits.mockResolvedValue([]);
  });

  it('clears all data and advances the vault epoch', async () => {
    const start = new Date(2025, 8, 25, 10).getTime();
    await db.pages.put(page('https://example.com/a', start));
    await db.visits.put(visit('1', 'https://example.com/a', start));

    const before = await getVaultEpoch();
    await clearVaultData();

    expect(await getVaultCounts()).toEqual({ pages: 0, visits: 0 });
    expect(await getVaultEpoch()).toBe(before + 1);
  });

  it('rejects import writes that belong to a cleared vault', async () => {
    const epoch = await getVaultEpoch();
    await clearVaultData();

    const result = await ingestHistoryItem(
      {
        id: 'stale',
        url: 'https://example.com/stale',
        title: 'Stale',
        lastVisitTime: Date.now(),
        visitCount: 1,
      },
      { source: 'import', notify: false, expectedEpoch: epoch },
    );

    expect(result.insertedVisits).toBe(0);
    expect(result.page).toBeNull();
    expect(await getVaultCounts()).toEqual({ pages: 0, visits: 0 });
  });

  it('accepts import writes while the epoch still matches', async () => {
    const epoch = await getVaultEpoch();

    const result = await ingestHistoryItem(
      {
        id: 'fresh',
        url: 'https://example.com/fresh',
        title: 'Fresh',
        lastVisitTime: Date.now(),
        visitCount: 1,
      },
      { source: 'import', notify: false, expectedEpoch: epoch },
    );

    expect(result.insertedVisits).toBe(1);
    expect(await db.pages.count()).toBe(1);
  });

  it('imports only visits inside the requested window and counts stored visits', async () => {
    const dayStart = new Date(2025, 8, 25).getTime();
    const dayEnd = new Date(2025, 8, 26).getTime();
    const url = 'https://example.com/window';

    history.getVisits.mockResolvedValue([
      { visitId: 'old', visitTime: dayStart - 86_400_000, transition: 'link' },
      { visitId: 'new', visitTime: dayStart + 3_600_000, transition: 'link' },
    ] as never);

    const result = await ingestHistoryItem(
      {
        id: 'window',
        url,
        title: 'Window',
        lastVisitTime: dayStart + 3_600_000,
        visitCount: 2,
      },
      { source: 'import', notify: false, since: dayStart, until: dayEnd },
    );

    expect(result.insertedVisits).toBe(1);
    expect(await db.visits.where('url').equals(url).count()).toBe(1);
    expect((await db.pages.get(url))?.visitCount).toBe(1);
  });

  it('updates a page title when a later ingest provides one', async () => {
    const item = {
      id: 'title-test',
      url: 'https://example.com/title',
      title: '',
      lastVisitTime: new Date(2025, 8, 25, 10).getTime(),
      visitCount: 1,
    };

    await ingestHistoryItem(item);
    expect((await db.pages.get(item.url))?.title).toBe('');

    await ingestHistoryItem({ ...item, title: 'Resolved Title' });
    expect((await db.pages.get(item.url))?.title).toBe('Resolved Title');
  });

  it('deletes a URL only for the requested day', async () => {
    const dayOne = new Date(2025, 8, 25, 10).getTime();
    const dayTwo = new Date(2025, 8, 26, 10).getTime();
    const url = 'https://example.com/a';

    await db.pages.put(page(url, dayTwo));
    await db.visits.bulkPut([
      visit('1', url, dayOne),
      visit('2', url, dayTwo),
      visit('3', 'https://other.test/b', dayTwo),
    ]);

    await deleteUrlFromVault(url, new Date(dayOne));

    expect(await db.visits.where('url').equals(url).count()).toBe(1);
    const remainingPage = await db.pages.get(url);
    expect(remainingPage?.visitCount).toBe(1);
    expect(remainingPage?.firstVisitTime).toBe(dayTwo);
    expect(remainingPage?.lastVisitTime).toBe(dayTwo);
  });

  it('removes a whole day and cleans up orphan pages', async () => {
    const dayOne = new Date(2025, 8, 25, 10).getTime();
    const dayTwo = new Date(2025, 8, 26, 10).getTime();

    await db.pages.bulkPut([
      page('https://example.com/a', dayOne),
      page('https://other.test/b', dayTwo),
    ]);
    await db.visits.bulkPut([
      visit('1', 'https://example.com/a', dayOne),
      visit('2', 'https://other.test/b', dayTwo),
    ]);

    await deleteDayFromVault(new Date(dayOne));

    expect(await db.visits.count()).toBe(1);
    expect(await db.pages.get('https://example.com/a')).toBeUndefined();
    expect(await db.pages.get('https://other.test/b')).toBeDefined();
  });

  it('removes inferred redirect hops and their pages', async () => {
    const at = new Date(2025, 8, 25, 10).getTime();
    const firstUrl = 'http://example.com/';
    const secondUrl = 'https://example.com/';
    const finalUrl = 'https://www.example.com/home';

    await db.pages.bulkPut([page(firstUrl, at), page(secondUrl, at), page(finalUrl, at)]);
    await db.visits.bulkPut([
      { ...visit('101', firstUrl, at), referringVisitId: 'previous' },
      { ...visit('102', secondUrl, at), referringVisitId: '101' },
      { ...visit('103', finalUrl, at), referringVisitId: '102' },
    ]);

    const removed = await removeInferredRedirectVisits(at, at + 1);

    expect(removed).toBe(2);
    expect(await db.visits.get('101')).toBeUndefined();
    expect(await db.visits.get('102')).toBeUndefined();
    expect(await db.visits.get('103')).toBeDefined();
    expect(await db.pages.get(firstUrl)).toBeUndefined();
    expect(await db.pages.get(secondUrl)).toBeUndefined();
    expect(await db.pages.get(finalUrl)).toBeDefined();
  });

  it('removes saved same-document URL variants and their pages', async () => {
    const at = new Date(2025, 8, 25, 10).getTime();
    const firstUrl = 'https://example.com/search?q=sample';
    const finalUrl = 'https://example.com/search?q=sample&ei=abc';

    await db.pages.bulkPut([
      { ...page(firstUrl, at), title: firstUrl, titleLower: firstUrl },
      { ...page(finalUrl, at + 500), title: 'Sample', titleLower: 'sample' },
    ]);
    await db.visits.bulkPut([
      { ...visit('state-1', firstUrl, at), referringVisitId: '0' },
      { ...visit('state-2', finalUrl, at + 500), referringVisitId: '0' },
    ]);

    const removed = await removeSupersededSameDocumentVisits(at, at + 10_000);

    expect(removed).toBe(1);
    expect(await db.visits.get('state-1')).toBeUndefined();
    expect(await db.visits.get('state-2')).toBeDefined();
    expect(await db.pages.get(firstUrl)).toBeUndefined();
    expect(await db.pages.get(finalUrl)).toBeDefined();
  });
});
