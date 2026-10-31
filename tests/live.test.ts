import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { db } from '../utils/db';
import {
  getNavigationState,
  handleRedirectSource,
  handleSameDocumentNavigation,
  resetLiveState,
  storeVisitedItem,
} from '../utils/history/live';
import {
  getCachedRedirectMarkers,
  isRedirectedVisit,
  resetRedirectMarkersCache,
} from '../utils/history/redirects';
import { browserVisit, visitRecord } from './factories';

vi.mock('../utils/delay', () => ({
  delay: vi.fn().mockResolvedValue(undefined),
}));

const historySearch = vi.fn();
const historyGetVisits = vi.fn();

Object.assign(fakeBrowser, {
  history: { search: historySearch, getVisits: historyGetVisits },
});

const NOW = Date.now();
const URL = 'https://example.test/page';

function item(title: string, time = NOW) {
  return { id: URL, url: URL, title, lastVisitTime: time, visitCount: 1 };
}

describe('live visit handling', () => {
  beforeEach(async () => {
    await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
    await fakeBrowser.storage.local.clear();
    historySearch.mockReset();
    historyGetVisits.mockReset();
    historyGetVisits.mockResolvedValue([browserVisit('v1', NOW)]);
    resetLiveState();
    resetRedirectMarkersCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores a visited page', async () => {
    await storeVisitedItem(item('Example'));

    expect(await db.visits.count()).toBe(1);
    expect((await db.pages.get(URL))?.title).toBe('Example');
  });

  it('drops an intermediate redirect page and keeps its marker', async () => {
    await db.visits.put(visitRecord('old', URL, NOW));

    await handleRedirectSource({ url: URL, from: NOW - 1_000, to: NOW + 2_000 });

    expect(await db.visits.count()).toBe(0);
    expect(isRedirectedVisit(getCachedRedirectMarkers(), URL, NOW)).toBe(true);
  });

  it('suppresses the previous URL after a same-document navigation', async () => {
    await db.visits.put(visitRecord('old', URL, NOW));
    getNavigationState(1, 0).committed = { url: URL, time: NOW };

    handleSameDocumentNavigation({
      tabId: 1,
      frameId: 0,
      url: 'https://example.test/next',
      timeStamp: NOW + 1_000,
    });
    await vi.waitFor(async () => expect(await db.visits.count()).toBe(0));

    await storeVisitedItem(item('Example'));
    expect(await db.visits.count()).toBe(0);
  });
});
