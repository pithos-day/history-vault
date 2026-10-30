import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../utils/db';
import { getHighlightParts, parseSearchQuery, searchPages } from '../utils/history/search';
import type { PageRecord } from '../utils/history/types';

function page(url: string, title: string, lastVisitTime: number): PageRecord {
  const host = new URL(url).host;
  return {
    url,
    title,
    host,
    titleLower: title.normalize('NFKC').toLocaleLowerCase('ja-JP'),
    urlLower: url.normalize('NFKC').toLocaleLowerCase('ja-JP'),
    lastVisitTime,
    firstVisitTime: lastVisitTime,
    visitCount: 1,
  };
}

describe('search', () => {
  beforeEach(async () => {
    await db.pages.clear();
    await db.visits.clear();
    await db.meta.clear();
  });

  it('parses plain terms, site filters, and dates', () => {
    const parsed = parseSearchQuery('react site:example.com after:2025-09-01 before:2025-09-30');

    expect(parsed.terms).toEqual(['react']);
    expect(parsed.site).toBe('example.com');
    expect(parsed.after).toBe(new Date(2025, 8, 1).getTime());
    expect(parsed.before).toBe(new Date(2025, 8, 30).getTime());
  });

  it('finds pages by title, URL, and host', async () => {
    await db.pages.bulkPut([
      page('https://example.com/react', 'React docs', new Date(2025, 8, 25).getTime()),
      page('https://other.test/vue', 'Vue docs', new Date(2025, 8, 24).getTime()),
    ]);

    const results = await searchPages('react');

    expect(results).toHaveLength(1);
    expect(results[0]?.page.title).toBe('React docs');
  });

  it('filters by site and date range', async () => {
    await db.pages.bulkPut([
      page('https://example.com/a', 'Alpha', new Date(2025, 8, 25).getTime()),
      page('https://sub.example.com/b', 'Beta', new Date(2025, 8, 26).getTime()),
      page('https://other.test/c', 'Gamma', new Date(2025, 8, 27).getTime()),
    ]);

    const siteResults = await searchPages('site:example.com');
    const dateResults = await searchPages('after:2025-09-26 before:2025-09-27');

    expect(siteResults).toHaveLength(2);
    expect(dateResults).toHaveLength(1);
    expect(dateResults[0]?.page.title).toBe('Beta');
  });

  it('returns highlight parts without dropping unmatched text', () => {
    const parts = getHighlightParts('React and react-router', ['react']);

    expect(parts.map((part) => part.text).join('')).toBe('React and react-router');
    expect(parts.filter((part) => part.match)).toHaveLength(2);
  });
});
