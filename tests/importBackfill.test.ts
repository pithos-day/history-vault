import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { dayKey } from '../utils/date';
import { db } from '../utils/db';
import { importVaultFile } from '../utils/export';
import { pageRecord, visitRecord } from './factories';

const january = new Date(2026, 0, 15, 12).getTime();
const february = new Date(2026, 1, 1, 12).getTime();
const url = 'https://example.com/a';

function backfillFile(): File {
  const payload = {
    format: 'history-vault',
    version: 1,
    exportedAt: new Date().toISOString(),
    pages: [
      pageRecord(url, january, { title: 'Imported title' }),
      pageRecord('https://example.com/b', january, { title: 'Imported page' }),
    ],
    visits: [
      visitRecord('existing-1', url, february, { source: 'import' }),
      visitRecord('backfill-a', url, january, { source: 'import' }),
      visitRecord('backfill-b', 'https://example.com/b', january, { source: 'import' }),
    ],
  };
  return new File([JSON.stringify(payload)], 'backfill.json', { type: 'application/json' });
}

describe('vault JSON backfill', () => {
  beforeEach(async () => {
    await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
    await fakeBrowser.storage.local.clear();

    await db.pages.put(pageRecord(url, february, { title: 'Existing title' }));
    await db.visits.put(visitRecord('existing-1', url, february, { source: 'import' }));
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
