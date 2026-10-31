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

  it('keeps visits with a different query or a different path', () => {
    const ids = findSupersededVisitIds([
      {
        id: '1',
        url: 'https://www.google.com/search?q=other',
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

  it('removes an empty-title variant when the search query matches', () => {
    const ids = findSupersededVisitIds([
      {
        id: '1',
        url: 'https://www.google.com/search?q=sample&oq=sample',
        visitedAt: 1000,
        title: '',
        transition: 'typed',
        referringVisitId: '9',
      },
      {
        id: '2',
        url: 'https://www.google.com/search?q=sample&ie=UTF-8',
        visitedAt: 1200,
        title: 'sample - Google 検索',
        transition: 'link',
        referringVisitId: '8',
      },
    ]);

    expect(ids).toEqual(['1']);
  });

  it('removes URL-titled variants even when they have a referring visit', () => {
    const ids = findSupersededVisitIds([
      {
        id: '1',
        url: 'https://www.google.com/search?q=sample',
        visitedAt: 1000,
        title: 'https://www.google.com/search?q=sample',
        transition: 'link',
        referringVisitId: '9',
      },
      {
        id: '2',
        url: 'https://www.google.com/search?q=sample&ei=abc',
        visitedAt: 1200,
        title: 'sample - Google 検索',
        transition: 'link',
        referringVisitId: '8',
      },
    ]);

    expect(ids).toEqual(['1']);
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

  it('removes titled variants that only add tracking parameters', () => {
    const ids = findSupersededVisitIds([
      {
        ...base,
        id: '1',
        url: 'https://www.google.com/search?q=white&oq=white&ie=UTF-8',
        visitedAt: 1000,
        title: 'white - Google 検索',
      },
      {
        ...base,
        id: '2',
        url: 'https://www.google.com/search?q=white&oq=white&ie=UTF-8&sca_esv=5b4f&sxsrf=AKly5D&ei=abc&biw=1888&bih=875&uact=5',
        visitedAt: 1600,
        title: 'white - Google 検索',
      },
    ]);

    expect(ids).toEqual(['1']);
  });

  it('keeps titled variants whose meaningful query values differ', () => {
    const ids = findSupersededVisitIds([
      {
        ...base,
        id: '1',
        url: 'https://www.google.com/search?q=white',
        visitedAt: 1000,
        title: 'white - Google 検索',
      },
      {
        ...base,
        id: '2',
        url: 'https://www.google.com/search?q=black&ei=abc',
        visitedAt: 1600,
        title: 'black - Google 検索',
      },
    ]);

    expect(ids).toEqual([]);
  });

  it('keeps titled variants that add a meaningful query parameter', () => {
    const ids = findSupersededVisitIds([
      {
        ...base,
        id: '1',
        url: 'https://www.google.com/search?q=white',
        visitedAt: 1000,
        title: 'white - Google 検索',
      },
      {
        ...base,
        id: '2',
        url: 'https://www.google.com/search?q=white&start=10',
        visitedAt: 1600,
        title: 'white - Google 検索',
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
