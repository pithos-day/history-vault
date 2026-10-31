import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { db } from '../utils/db';
import { ingestHistoryItem } from '../utils/history/collect';

const { getVisits } = vi.hoisted(() => ({ getVisits: vi.fn() }));

vi.mock('wxt/browser', () => ({
  browser: {
    history: { getVisits },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
    runtime: { getURL: (path: string) => `chrome-extension://test${path}` },
  },
}));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = new Date(2026, 9, 1).getTime();
const END = START + DAY;
const NOW = new Date(2026, 9, 31, 12).getTime();
const URL = 'https://example.com/current';

function visit(visitTime: number): Browser.history.VisitItem {
  return {
    id: 'page',
    visitId: 'visit-1',
    visitTime,
    transition: 'link',
    referringVisitId: '0',
    isLocal: true,
  };
}

function item(lastVisitTime: number): Browser.history.HistoryItem {
  return {
    id: 'page',
    url: URL,
    title: 'Current page',
    lastVisitTime,
    visitCount: 1,
  };
}

beforeEach(async () => {
  await Promise.all([db.pages.clear(), db.visits.clear(), db.activity.clear(), db.meta.clear()]);
  getVisits.mockReset();
});

describe('ingestHistoryItem import window', () => {
  it('ignores a page whose only visits are outside the requested window', async () => {
    getVisits.mockResolvedValue([visit(NOW)]);

    const result = await ingestHistoryItem(item(NOW), {
      source: 'import',
      notify: false,
      since: START,
      until: END,
    });

    expect(result).toMatchObject({ insertedVisits: 0, matchedVisits: 0, page: null });
    expect(await db.visits.count()).toBe(0);
    expect(await db.pages.count()).toBe(0);
  });

  it('does not overwrite an existing page with current metadata from an empty window', async () => {
    await db.pages.put({
      url: URL,
      title: 'Old title',
      host: 'example.com',
      titleLower: 'old title',
      urlLower: URL.toLowerCase(),
      lastVisitTime: START - DAY,
      firstVisitTime: START - DAY,
      visitCount: 1,
    });
    getVisits.mockResolvedValue([visit(NOW)]);

    await ingestHistoryItem(item(NOW), {
      source: 'import',
      notify: false,
      since: START,
      until: END,
    });

    expect(await db.pages.get(URL)).toMatchObject({
      title: 'Old title',
      lastVisitTime: START - DAY,
    });
  });

  it('stores a fallback visit only when the item timestamp is inside the window', async () => {
    getVisits.mockResolvedValue([]);

    const result = await ingestHistoryItem(item(START + HOUR), {
      source: 'import',
      notify: false,
      since: START,
      until: END,
    });

    expect(result).toMatchObject({ insertedVisits: 1, matchedVisits: 1 });
    expect(await db.visits.get(`fallback:${URL}:${START + HOUR}`)).toMatchObject({
      visitedAt: START + HOUR,
      source: 'fallback',
    });
  });

  it('rejects a fallback visit outside the requested window', async () => {
    getVisits.mockResolvedValue([]);

    const result = await ingestHistoryItem(item(NOW), {
      source: 'import',
      notify: false,
      since: START,
      until: END,
    });

    expect(result).toMatchObject({ insertedVisits: 0, matchedVisits: 0, page: null });
    expect(await db.visits.count()).toBe(0);
    expect(await db.pages.count()).toBe(0);
  });

  it('does not store the URL as the page title', async () => {
    getVisits.mockResolvedValue([visit(NOW)]);

    await ingestHistoryItem({ ...item(NOW), title: URL }, { notify: false });

    expect((await db.pages.get(URL))?.title).toBe('');
  });

  it('does not store another URL as the page title', async () => {
    getVisits.mockResolvedValue([visit(NOW)]);

    await ingestHistoryItem(
      { ...item(NOW), title: 'https://example.com/search?q=old' },
      { notify: false },
    );

    expect((await db.pages.get(URL))?.title).toBe('');
  });

  it('does not store a scheme-less URL as the page title', async () => {
    getVisits.mockResolvedValue([visit(NOW)]);

    await ingestHistoryItem({ ...item(NOW), title: 'example.com/current' }, { notify: false });

    expect((await db.pages.get(URL))?.title).toBe('');
  });

  it('replaces a stored URL title with the resolved title', async () => {
    getVisits.mockResolvedValue([visit(NOW)]);
    await ingestHistoryItem({ ...item(NOW), title: URL }, { notify: false });

    await ingestHistoryItem({ ...item(NOW), title: 'Resolved Title' }, { notify: false });

    expect((await db.pages.get(URL))?.title).toBe('Resolved Title');
  });
});
