import { describe, expect, it } from 'vitest';
import {
  findRedirectSource,
  findSupersededRedirectVisitIds,
  isRedirectedVisit,
  pruneRedirectMarkers,
} from '../utils/history/redirects';

describe('inferred redirect chains', () => {
  it('keeps only the final hop when every hop shares a timestamp', () => {
    const ids = findSupersededRedirectVisitIds([
      { id: '10', url: 'http://example.test/', visitedAt: 1000, referringVisitId: '4' },
      { id: '11', url: 'https://example.test/', visitedAt: 1000, referringVisitId: '10' },
      { id: '12', url: 'https://www.example.test/home', visitedAt: 1000, referringVisitId: '11' },
      { id: '13', url: 'https://example.test/next', visitedAt: 3000, referringVisitId: '12' },
    ]);

    expect(ids).toEqual(['10', '11']);
  });

  it('keeps visits that only share a timestamp', () => {
    const ids = findSupersededRedirectVisitIds([
      { id: '20', url: 'https://a.test/', visitedAt: 2000, referringVisitId: '1' },
      { id: '21', url: 'https://b.test/', visitedAt: 2000, referringVisitId: '2' },
    ]);

    expect(ids).toEqual([]);
  });

  it('ignores chains outside the timestamp, reloads and synthetic visits', () => {
    const ids = findSupersededRedirectVisitIds([
      { id: '30', url: 'https://a.test/', visitedAt: 3000, referringVisitId: '1' },
      { id: '31', url: 'https://b.test/', visitedAt: 4000, referringVisitId: '30' },
      { id: '32', url: 'https://c.test/', visitedAt: 5000, referringVisitId: '32' },
      { id: 'fallback:a', url: 'https://d.test/', visitedAt: 6000, referringVisitId: 'fallback:b' },
      { id: '33', url: 'https://e.test/', visitedAt: 7000, referringVisitId: 'fallback:a' },
    ]);

    expect(ids).toEqual([]);
  });

  it('does not drop the only visit when a redirect points at itself', () => {
    const ids = findSupersededRedirectVisitIds([
      { id: '40', url: 'https://a.test/', visitedAt: 8000, referringVisitId: '40' },
      { id: '41', url: 'https://a.test/', visitedAt: 9000, referringVisitId: '40' },
    ]);

    expect(ids).toEqual([]);
  });
});

describe('redirect detection', () => {
  it('treats the pending navigation as the source of a server redirect', () => {
    const source = findRedirectSource({
      targetUrl: 'https://target.test/final',
      targetTime: 1000,
      qualifiers: ['server_redirect'],
      lastBeforeNavigate: { url: 'https://source.test/go', time: 990 },
      lastCommitted: { url: 'https://previous.test/', time: 500 },
    });

    expect(source).toEqual({
      url: 'https://source.test/go',
      from: -10,
      to: 3000,
    });
  });

  it('treats the previous committed page as the source of a client redirect', () => {
    const source = findRedirectSource({
      targetUrl: 'https://target.test/final',
      targetTime: 5000,
      qualifiers: ['client_redirect'],
      lastBeforeNavigate: { url: 'https://target.test/final', time: 4990 },
      lastCommitted: { url: 'https://source.test/redirect', time: 4000 },
    });

    expect(source).toEqual({
      url: 'https://source.test/redirect',
      from: 3000,
      to: 7000,
    });
  });

  it('ignores ordinary navigations and self redirects', () => {
    expect(
      findRedirectSource({
        targetUrl: 'https://target.test/',
        targetTime: 1000,
        qualifiers: [],
        lastCommitted: { url: 'https://source.test/', time: 500 },
      }),
    ).toBeNull();
    expect(
      findRedirectSource({
        targetUrl: 'https://target.test/',
        targetTime: 1000,
        qualifiers: ['server_redirect'],
        lastBeforeNavigate: { url: 'https://target.test/', time: 990 },
      }),
    ).toBeNull();
  });

  it('matches only visits inside the marker window', () => {
    const markers = [{ url: 'https://source.test/', from: 100, to: 200 }];

    expect(isRedirectedVisit(markers, 'https://source.test/', 150)).toBe(true);
    expect(isRedirectedVisit(markers, 'https://source.test/', 201)).toBe(false);
    expect(isRedirectedVisit(markers, 'https://other.test/', 150)).toBe(false);
  });

  it('prunes expired markers and keeps the newest entries', () => {
    const now = 1_000_000_000_000;
    const pruned = pruneRedirectMarkers(
      [
        { url: 'old', from: 0, to: now - 91 * 86_400_000 },
        { url: 'new', from: now - 1000, to: now },
      ],
      now,
    );

    expect(pruned.map((marker) => marker.url)).toEqual(['new']);
  });
});
