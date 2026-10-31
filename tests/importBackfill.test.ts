import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { dayKey } from '../utils/date';
import { db } from '../utils/db';
import { importVaultFile } from '../utils/export';
import type { PageRecord, VisitRecord } from '../utils/history/types';

const january = new Date(2026, 0, 15, 12).getTime();
const february = new Date(2026, 1, 1, 12).getTime();
const url = 'https://example.com/a';

function page(overrides: Partial<PageRecord> & Pick<PageRecord, 'url'>): PageRecord {
  const title = overrides.title ?? overrides.url;
  const { url, ...rest } = overrides;
  return {
    url,
    title,
    host: new URL(url).host,
    titleLower: title.toLowerCase(),
    urlLower: url.toLowerCase(),
    firstVisitTime: february,
    lastVisitTime: february,
    visitCount: 1,
    ...rest,
  };
}

function visit(id: string, visitedAt: number, target = url): VisitRecord {
  return {
    id,
    url: target,
    host: new URL(target).host,
    visitedAt,
    transition: 'link',
    source: 'import',
  };
}

function backfillFile(): File {
  const payload = {
    format: 'history-vault',
    version: 1,
    exportedAt: new Date().toISOString(),
    pages: [
      page({ url, title: 'Imported title', firstVisitTime: january, lastVisitTime: january }),
      page({
        url: 'https://example.com/b',
        title: 'Imported page',
        firstVisitTime: january,
        lastVisitTime: january,
      }),
    ],
    visits: [
      visit('existing-1', february),
      visit('backfill-a', january),
      visit('backfill-b', january, 'https://example.com/b'),
    ],
  };
  return new File([JSON.stringify(payload)], 'backfill.json', { type: 'application/json' });
}

describe('vault JSON backfill', () => {
  beforeEach(async () => {
    await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
    await fakeBrowser.storage.local.clear();

    await db.pages.put(page({ url, title: 'Existing title' }));
    await db.visits.put(visit('existing-1', february));
    await db.activity.put({ date: dayKey(february), views: 1, pages: 1 });
  });

  it('merges page aggregates and skips visits that already exist', async () => {
    const result = await importVaultFile(backfillFile());

    expect(result).toEqual({ pages: 2, visits: 2 });
    expect(await db.visits.count()).toBe(3);

    const merged = await db.pages.get(url);
    expect(merged).toMatchObject({
      title: 'Imported title',
      firstVisitTime: january,
      lastVisitTime: february,
      visitCount: 2,
    });

    const created = await db.pages.get('https://example.com/b');
    expect(created).toMatchObject({
      title: 'Imported page',
      firstVisitTime: january,
      lastVisitTime: january,
      visitCount: 1,
    });

    expect(await db.activity.get(dayKey(january))).toEqual({
      date: dayKey(january),
      views: 2,
      pages: 2,
    });
    expect(await db.activity.get(dayKey(february))).toEqual({
      date: dayKey(february),
      views: 1,
      pages: 1,
    });
  });

  it('is idempotent when the same backfill is imported again', async () => {
    await importVaultFile(backfillFile());
    const result = await importVaultFile(backfillFile());

    expect(result).toEqual({ pages: 2, visits: 0 });
    expect(await db.visits.count()).toBe(3);
    expect((await db.pages.get(url))?.visitCount).toBe(2);
    expect((await db.activity.get(dayKey(january)))?.views).toBe(2);
  });
});
