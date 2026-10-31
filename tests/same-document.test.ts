import { describe, expect, it } from 'vitest';
import {
  findSupersededVisitIds,
  isSuppressedVisit,
  pruneSuppressedVisits,
  suppressVisit,
} from '../utils/history/same-document';

describe('same-document navigation suppression', () => {
  it('suppresses the previous URL around its visit time', () => {
    const now = 10_000;
    const markers = suppressVisit([], 'https://example.com/search?q=a', now, now);

    expect(isSuppressedVisit(markers, 'https://example.com/search?q=a', now)).toBe(true);
    expect(isSuppressedVisit(markers, 'https://example.com/search?q=a', now - 1999)).toBe(true);
    expect(isSuppressedVisit(markers, 'https://example.com/search?q=a', now + 2999)).toBe(true);
    expect(isSuppressedVisit(markers, 'https://example.com/search?q=a', now + 3001)).toBe(false);
    expect(isSuppressedVisit(markers, 'https://example.com/other', now)).toBe(false);
  });

  it('keeps only recent markers', () => {
    const now = 10_000_000;
    const markers = pruneSuppressedVisits(
      [
        { url: 'old', from: 0, to: now - 61_000 },
        { url: 'new', from: now - 1000, to: now + 3000 },
      ],
      now,
    );

    expect(markers.map((marker) => marker.url)).toEqual(['new']);
  });

  it('caps the marker list', () => {
    const now = 10_000_000;
    let markers = suppressVisit([], 'https://example.com/start', now, now);
    for (let index = 0; index < 250; index += 1) {
      markers = suppressVisit(markers, `https://example.com/${index}`, now, now);
    }

    expect(markers).toHaveLength(200);
    expect(markers.at(-1)?.url).toBe('https://example.com/249');
  });
});

describe('same-document cleanup', () => {
  const base = {
    transition: 'link',
    referringVisitId: '0',
  };

  it('removes earlier untitled URL variants in a same-path chain', () => {
    const ids = findSupersededVisitIds([
      {
        ...base,
        id: '1',
        url: 'https://www.google.com/search?q=sample',
        visitedAt: 1000,
        title: 'https://www.google.com/search?q=sample',
      },
      {
        ...base,
        id: '2',
        url: 'https://www.google.com/search?q=sample&ei=abc',
        visitedAt: 1200,
        title: 'sample - Google 検索',
      },
    ]);

    expect(ids).toEqual(['1']);
  });

  it('keeps visits with a referring visit or a different path', () => {
    const ids = findSupersededVisitIds([
      {
        id: '1',
        url: 'https://www.google.com/search?q=sample',
        visitedAt: 1000,
        title: '',
        transition: 'link',
        referringVisitId: '9',
      },
      {
        ...base,
        id: '2',
        url: 'https://www.google.com/other?q=sample',
        visitedAt: 1200,
        title: 'Other',
      },
      {
        ...base,
        id: '3',
        url: 'https://www.google.com/search?q=sample&ei=abc',
        visitedAt: 1400,
        title: 'sample - Google 検索',
      },
    ]);

    expect(ids).toEqual([]);
  });

  it('keeps a final page that still has no usable title', () => {
    const ids = findSupersededVisitIds([
      {
        ...base,
        id: '1',
        url: 'https://example.com/search?a=1',
        visitedAt: 1000,
        title: 'https://example.com/search?a=1',
      },
      {
        ...base,
        id: '2',
        url: 'https://example.com/search?a=1&b=2',
        visitedAt: 1200,
        title: '',
      },
    ]);

    expect(ids).toEqual([]);
  });

  it('does not join visits more than five seconds apart', () => {
    const ids = findSupersededVisitIds([
      {
        ...base,
        id: '1',
        url: 'https://example.com/search?a=1',
        visitedAt: 1000,
        title: '',
      },
      {
        ...base,
        id: '2',
        url: 'https://example.com/search?a=1&b=2',
        visitedAt: 7000,
        title: 'Resolved',
      },
    ]);

    expect(ids).toEqual([]);
  });
});
