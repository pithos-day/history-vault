import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { db } from '../utils/db';
import {
  cancelImport,
  getImportState,
  IMPORT_STATE_KEY,
  runImportBatch,
  startImport,
} from '../utils/history/import';

const historySearch = vi.fn();
const historyGetVisits = vi.fn();

Object.assign(fakeBrowser, {
  history: { search: historySearch, getVisits: historyGetVisits },
});

const NOW = new Date(2026, 9, 31, 12).getTime();

function item(url: string, lastVisitTime: number) {
  return { id: url, url, title: 'Example', lastVisitTime, visitCount: 1 };
}

function visit(id: string, visitTime: number) {
  return {
    id: 'page',
    visitId: id,
    visitTime,
    transition: 'link',
    referringVisitId: '0',
    isLocal: true,
  };
}

describe('import batch', () => {
  beforeEach(async () => {
    await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
    await fakeBrowser.storage.local.clear();
    historySearch.mockReset();
    historyGetVisits.mockReset();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('processes the requested window and leaves no import lock behind', async () => {
    historySearch.mockImplementation(
      async ({ startTime, endTime }: { startTime: number; endTime: number }) =>
        [item('https://example.test/a', NOW - 1_000)].filter(
          (entry) => entry.lastVisitTime >= startTime && entry.lastVisitTime < endTime,
        ),
    );
    historyGetVisits.mockResolvedValue([visit('v1', NOW - 1_000)]);

    await startImport({ windowDays: 1 });
    const state = await runImportBatch(80);

    expect(state.phase).toBe('done');
    expect(state.daysDone).toBe(2);
    expect(state.pages).toBe(1);
    expect(state.visits).toBe(1);
    expect(await db.visits.count()).toBe(1);
    expect((await fakeBrowser.storage.local.get('importLock')).importLock).toBeUndefined();
  });

  it('keeps the cursor when the history query returns nothing', async () => {
    historySearch.mockResolvedValue([]);

    await startImport({ windowDays: 1 });
    const state = await runImportBatch(80);

    expect(state.phase).toBe('done');
    expect(state.daysDone).toBe(2);
    expect(state.emptyStreak).toBe(2);
    expect(await db.visits.count()).toBe(0);
  });

  it('cancels a running import and releases an existing lock', async () => {
    await fakeBrowser.storage.local.set({
      importLock: { owner: 'other-owner', expiresAt: NOW + 60_000 },
    });
    await startImport({ windowDays: 1 });

    await cancelImport();

    const state = await getImportState();
    expect(state.phase).toBe('idle');
    expect((await fakeBrowser.storage.local.get('importLock')).importLock).toBeUndefined();
    expect((await fakeBrowser.storage.local.get(IMPORT_STATE_KEY))[IMPORT_STATE_KEY]).toMatchObject(
      {
        phase: 'idle',
      },
    );
  });
});
