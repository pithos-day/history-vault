import { parseDayKey, startOfDay } from '../date';
import { db } from '../db';
import type { PageRecord, SearchResult } from './types';

interface ParsedSearch {
  terms: string[];
  site?: string;
  after?: number;
  before?: number;
}

export interface SearchPage {
  results: SearchResult[];
  total: number;
  truncated: boolean;
}

export const SEARCH_RESULT_LIMIT = 500;

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ja-JP');
}

export function parseSearchQuery(query: string): ParsedSearch {
  const terms: string[] = [];
  let site: string | undefined;
  let after: number | undefined;
  let before: number | undefined;

  for (const token of tokenize(query)) {
    if (token.startsWith('site:')) {
      const value = token
        .slice('site:'.length)
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
      if (value) site = normalizeSearchText(value);
      continue;
    }

    if (token.startsWith('after:')) {
      const parsed = parseDayKey(token.slice('after:'.length));
      if (parsed) after = startOfDay(parsed).getTime();
      continue;
    }

    if (token.startsWith('before:')) {
      const parsed = parseDayKey(token.slice('before:'.length));
      if (parsed) before = startOfDay(parsed).getTime();
      continue;
    }

    terms.push(normalizeSearchText(token));
  }

  return { terms, site, after, before };
}

export async function searchPages(query: string, limit = SEARCH_RESULT_LIMIT): Promise<SearchPage> {
  const parsed = parseSearchQuery(query);
  if (
    parsed.terms.length === 0 &&
    !parsed.site &&
    parsed.after === undefined &&
    parsed.before === undefined
  ) {
    return { results: [], total: 0, truncated: false };
  }

  const pages = await db.pages.toArray();
  const results: SearchResult[] = [];

  for (const page of pages) {
    if (!matchesPage(page, parsed)) continue;
    results.push({
      page,
      latestVisitTime: page.lastVisitTime,
      count: page.visitCount,
    });
  }

  results.sort((left, right) => right.latestVisitTime - left.latestVisitTime);
  return {
    results: results.slice(0, limit),
    total: results.length,
    truncated: results.length > limit,
  };
}

function matchesPage(page: PageRecord, parsed: ParsedSearch): boolean {
  if (parsed.site) {
    const host = normalizeSearchText(page.host);
    if (host !== parsed.site && !host.endsWith(`.${parsed.site}`)) return false;
  }

  if (parsed.after !== undefined && page.lastVisitTime < parsed.after) return false;
  if (parsed.before !== undefined && page.lastVisitTime >= parsed.before) return false;

  return parsed.terms.every(
    (term) =>
      page.titleLower.includes(term) ||
      page.urlLower.includes(term) ||
      normalizeSearchText(page.host).includes(term),
  );
}

function tokenize(query: string): string[] {
  const tokens: string[] = [];
  const regex = /"([^"]+)"|(\S+)/g;

  for (const match of query.matchAll(regex)) {
    const token = match[1] ?? match[2];
    if (token) tokens.push(token);
  }

  return tokens;
}
