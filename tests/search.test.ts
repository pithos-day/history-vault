import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../utils/db';
import { parseSearchQuery, searchPages } from '../utils/history/search';
import { pageRecord } from './factories';

describe('search', () => {
  beforeEach(async () => {
    await db.pages.clear();
    await db.visits.clear();
    await db.activity.clear();
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
      pageRecord('https://example.com/react', new Date(2025, 8, 25).getTime(), {
        title: 'React docs',
      }),
      pageRecord('https://other.test/vue', new Date(2025, 8, 24).getTime(), { title: 'Vue docs' }),
    ]);

    const page = await searchPages('react');

    expect(page.results).toHaveLength(1);
    expect(page.results[0]?.page.title).toBe('React docs');
    expect(page.total).toBe(1);
    expect(page.truncated).toBe(false);
  });

  it('filters by site and date range', async () => {
    await db.pages.bulkPut([
      pageRecord('https://example.com/a', new Date(2025, 8, 25).getTime(), { title: 'Alpha' }),
      pageRecord('https://sub.example.com/b', new Date(2025, 8, 26).getTime(), { title: 'Beta' }),
      pageRecord('https://other.test/c', new Date(2025, 8, 27).getTime(), { title: 'Gamma' }),
    ]);

    const siteResults = await searchPages('site:example.com');
    const dateResults = await searchPages('after:2025-09-26 before:2025-09-27');

    expect(siteResults.results).toHaveLength(2);
    expect(dateResults.results).toHaveLength(1);
    expect(dateResults.results[0]?.page.title).toBe('Beta');
  });

  it('reports when results are truncated by the display limit', async () => {
    await db.pages.bulkPut([
      pageRecord('https://example.com/a', new Date(2025, 8, 25).getTime(), { title: 'Alpha' }),
      pageRecord('https://example.com/b', new Date(2025, 8, 26).getTime(), { title: 'Beta' }),
      pageRecord('https://example.com/c', new Date(2025, 8, 27).getTime(), { title: 'Gamma' }),
    ]);

    const page = await searchPages('example.com', 2);

    expect(page.results).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.truncated).toBe(true);
  });
});
