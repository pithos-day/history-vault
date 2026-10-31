import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { db } from '../utils/db';
import { storeVisitedItem } from '../utils/history/live';
import { isSuppressedVisit } from '../utils/history/same-document';
import { browserVisit } from './factories';

vi.mock('../utils/delay', () => ({
  delay: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/history/same-document', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/history/same-document')>();
  return { ...actual, isSuppressedVisit: vi.fn() };
});

const historyGetVisits = vi.fn();

Object.assign(fakeBrowser, {
  history: { search: vi.fn(), getVisits: historyGetVisits },
});

const NOW = Date.now();
const URL = 'https://example.test/late';

describe('late live visit re-checks', () => {
  beforeEach(async () => {
    await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
    await fakeBrowser.storage.local.clear();
    historyGetVisits.mockReset();
    historyGetVisits.mockResolvedValue([browserVisit('v1', NOW)]);
    vi.mocked(isSuppressedVisit).mockReset();
  });

  it('deletes a visit that becomes suppressed while the title is repaired', async () => {
    vi.mocked(isSuppressedVisit)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    await storeVisitedItem({
      id: 'page',
      url: URL,
      title: '',
      lastVisitTime: NOW,
      visitCount: 1,
    });

    expect(await db.visits.count()).toBe(0);
  });
});
