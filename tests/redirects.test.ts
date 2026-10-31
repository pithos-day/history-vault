import { describe, expect, it } from 'vitest';
import {
  findRedirectSource,
  isRedirectedVisit,
  pruneRedirectMarkers,
} from '../utils/history/redirects';

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
