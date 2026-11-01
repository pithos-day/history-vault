import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { db } from '../utils/db';
import { ingestHistoryItem } from '../utils/history/collect';
import { getVaultEpoch } from '../utils/history/epoch';
import {
  cleanupHistoryRange,
  clearVaultData,
  deleteDayFromVault,
  deleteUrlFromVault,
  getVaultCounts,
  removeInferredRedirectVisits,
  removeSupersededSameDocumentVisits,
} from '../utils/history/query';
import {
  getCachedRedirectMarkers,
  isRedirectedVisit,
  resetRedirectMarkersCache,
} from '../utils/history/redirects';
import { pageRecord, visitRecord } from './factories';

const history = {
  search: vi.fn(),
  getVisits: vi.fn(),
};

Object.assign(fakeBrowser, { history });

describe('vault maintenance', () => {
  beforeEach(async () => {
    await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
    resetRedirectMarkersCache();
    history.search.mockReset();
    history.getVisits.mockReset();
    history.getVisits.mockResolvedValue([]);
  });

  it('clears all data and advances the vault epoch', async () => {
    const start = new Date(2025, 8, 25, 10).getTime();
    await db.pages.put(pageRecord('https://example.com/a', start));
    await db.visits.put(visitRecord('1', 'https://example.com/a', start));

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

    await db.pages.put(pageRecord(url, dayTwo));
    await db.visits.bulkPut([
      visitRecord('1', url, dayOne),
      visitRecord('2', url, dayTwo),
      visitRecord('3', 'https://other.test/b', dayTwo),
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
      pageRecord('https://example.com/a', dayOne),
      pageRecord('https://other.test/b', dayTwo),
    ]);
    await db.visits.bulkPut([
      visitRecord('1', 'https://example.com/a', dayOne),
      visitRecord('2', 'https://other.test/b', dayTwo),
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

    await db.pages.bulkPut([
      pageRecord(firstUrl, at),
      pageRecord(secondUrl, at),
      pageRecord(finalUrl, at),
    ]);
    await db.visits.bulkPut([
      { ...visitRecord('101', firstUrl, at), referringVisitId: 'previous' },
      { ...visitRecord('102', secondUrl, at), referringVisitId: '101' },
      { ...visitRecord('103', finalUrl, at), referringVisitId: '102' },
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

  it('marks inferred redirect hops so late live writes cannot restore them', async () => {
    const at = Date.now() - 60_000;
    const firstUrl = 'http://example.com/';
    const secondUrl = 'https://example.com/';
    const finalUrl = 'https://www.example.com/home';

    await db.pages.bulkPut([
      pageRecord(firstUrl, at),
      pageRecord(secondUrl, at),
      pageRecord(finalUrl, at),
    ]);
    await db.visits.bulkPut([
      { ...visitRecord('111', firstUrl, at), referringVisitId: 'previous' },
      { ...visitRecord('112', secondUrl, at), referringVisitId: '111' },
      { ...visitRecord('113', finalUrl, at), referringVisitId: '112' },
    ]);

    await removeInferredRedirectVisits(at, at + 1);

    const markers = getCachedRedirectMarkers();
    expect(isRedirectedVisit(markers, firstUrl, at)).toBe(true);
    expect(isRedirectedVisit(markers, secondUrl, at)).toBe(true);
    expect(isRedirectedVisit(markers, finalUrl, at)).toBe(false);
  });

  it('removes redirect hops and same-document variants in one pass', async () => {
    const at = new Date(2025, 8, 25, 10).getTime();
    const redirectStart = 'http://redirect.test/';
    const redirectEnd = 'https://redirect.test/final';
    const variantStart = 'https://example.com/search?q=sample';
    const variantEnd = 'https://example.com/search?q=sample&ei=abc';

    await db.pages.bulkPut([
      pageRecord(redirectStart, at),
      pageRecord(redirectEnd, at),
      pageRecord(variantStart, at + 1000),
      pageRecord(variantEnd, at + 1500, { title: 'Sample' }),
    ]);
    await db.visits.bulkPut([
      { ...visitRecord('201', redirectStart, at), referringVisitId: '200' },
      { ...visitRecord('202', redirectEnd, at), referringVisitId: '201' },
      { ...visitRecord('301', variantStart, at + 1000), referringVisitId: '0' },
      { ...visitRecord('302', variantEnd, at + 1500), referringVisitId: '0' },
    ]);

    await cleanupHistoryRange(at, at + 10_000);

    expect(await db.visits.get('201')).toBeUndefined();
    expect(await db.visits.get('202')).toBeDefined();
    expect(await db.visits.get('301')).toBeUndefined();
    expect(await db.visits.get('302')).toBeDefined();
    expect(await db.pages.get(redirectStart)).toBeUndefined();
    expect(await db.pages.get(variantStart)).toBeUndefined();
  });

  it('removes saved same-document URL variants and their pages', async () => {
    const at = new Date(2025, 8, 25, 10).getTime();
    const firstUrl = 'https://example.com/search?q=sample';
    const finalUrl = 'https://example.com/search?q=sample&ei=abc';

    await db.pages.bulkPut([
      pageRecord(firstUrl, at),
      pageRecord(finalUrl, at + 500, { title: 'Sample' }),
    ]);
    await db.visits.bulkPut([
      { ...visitRecord('state-1', firstUrl, at), referringVisitId: '0' },
      { ...visitRecord('state-2', finalUrl, at + 500), referringVisitId: '0' },
    ]);

    const removed = await removeSupersededSameDocumentVisits(at, at + 10_000);

    expect(removed).toBe(1);
    expect(await db.visits.get('state-1')).toBeUndefined();
    expect(await db.visits.get('state-2')).toBeDefined();
    expect(await db.pages.get(firstUrl)).toBeUndefined();
    expect(await db.pages.get(finalUrl)).toBeDefined();
  });
});
