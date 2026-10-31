import { describe, expect, it } from 'vitest';
import type { Browser } from 'wxt/browser';
import { resolveVisits } from '../utils/history/collect';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = new Date(2026, 9, 1).getTime();
const END = START + DAY;
const URL = 'https://example.com/';

function visit(id: string, visitTime: number): Browser.history.VisitItem {
  return {
    id: 'page',
    visitId: id,
    visitTime,
    transition: 'link',
    referringVisitId: '0',
    isLocal: true,
  };
}

function item(lastVisitTime?: number): Browser.history.HistoryItem {
  return {
    id: 'page',
    url: URL,
    title: 'Example',
    lastVisitTime,
    visitCount: 1,
  };
}

describe('resolveVisits', () => {
  it('keeps only visits inside the requested window', () => {
    const visits = resolveVisits(
      URL,
      'example.com',
      [visit('inside', START + HOUR), visit('before', START - DAY)],
      item(START - HOUR),
      { source: 'import', since: START, until: END },
    );

    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({ id: 'inside', visitedAt: START + HOUR, source: 'import' });
  });

  it('does not fabricate a visit when Chrome returned only out-of-window visits', () => {
    const visits = resolveVisits(
      URL,
      'example.com',
      [visit('before', START - DAY)],
      item(START - HOUR),
      { source: 'import', since: START, until: END },
    );

    expect(visits).toEqual([]);
  });

  it('falls back to the item timestamp only when Chrome has no visit data', () => {
    const visits = resolveVisits(URL, 'example.com', [], item(START + 2 * HOUR), {
      source: 'import',
      since: START,
      until: END,
    });

    expect(visits).toHaveLength(1);
    expect(visits[0]).toMatchObject({
      id: `fallback:${URL}:${START + 2 * HOUR}`,
      visitedAt: START + 2 * HOUR,
      source: 'fallback',
    });
  });

  it('rejects a fallback outside the requested window', () => {
    const visits = resolveVisits(URL, 'example.com', [], item(START - DAY), {
      source: 'import',
      since: START,
      until: END,
    });

    expect(visits).toEqual([]);
  });

  it('rejects missing and epoch timestamps', () => {
    expect(
      resolveVisits(URL, 'example.com', [], item(undefined), { since: START, until: END }),
    ).toEqual([]);
    expect(resolveVisits(URL, 'example.com', [], item(0), { since: START, until: END })).toEqual(
      [],
    );
    expect(
      resolveVisits(URL, 'example.com', [visit('epoch', 0)], item(0), {
        since: START,
        until: END,
      }),
    ).toEqual([]);
  });

  it('keeps every visit when no window is given', () => {
    const visits = resolveVisits(
      URL,
      'example.com',
      [visit('old', START - DAY), visit('new', START + HOUR)],
      item(),
    );

    expect(visits.map((visit) => visit.id)).toEqual(['old', 'new']);
  });
});
