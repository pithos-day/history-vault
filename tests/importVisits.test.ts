import { describe, expect, it } from 'vitest';
import type { Browser } from 'wxt/browser';
import { resolveVisits } from '../utils/history/collect';
import { browserVisit } from './factories';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = new Date(2026, 9, 1).getTime();
const END = START + DAY;
const URL = 'https://example.com/';

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
      [browserVisit('inside', START + HOUR), browserVisit('before', START - DAY)],
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
      [browserVisit('before', START - DAY)],
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
      resolveVisits(URL, 'example.com', [browserVisit('epoch', 0)], item(0), {
        since: START,
        until: END,
      }),
    ).toEqual([]);
  });

  it('keeps every visit when no window is given', () => {
    const visits = resolveVisits(
      URL,
      'example.com',
      [browserVisit('old', START - DAY), browserVisit('new', START + HOUR)],
      item(),
    );

    expect(visits.map((visit) => visit.id)).toEqual(['old', 'new']);
  });

  it('drops a visit that belongs to a detected redirect intermediate', () => {
    const redirects = [
      {
        url: 'https://redirect.test/',
        from: START + HOUR - 1000,
        to: START + HOUR + 2000,
      },
    ];

    const intermediate = resolveVisits(
      'https://redirect.test/',
      'redirect.test',
      [browserVisit('redirect', START + HOUR)],
      item(START + HOUR),
      { source: 'import', since: START, until: END, redirects },
    );
    const destination = resolveVisits(
      URL,
      'example.com',
      [browserVisit('target', START + HOUR + 5)],
      item(START + HOUR + 5),
      { source: 'import', since: START, until: END, redirects },
    );

    expect(intermediate).toEqual([]);
    expect(destination).toHaveLength(1);
  });
});
