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
    await Promise.all([db.pages.clear(), db.visits.clear(), db.meta.clear()]);
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
    expect(await db.pages.get(url)).toBeDefined();
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
});
