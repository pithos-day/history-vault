import { parseDayKey, startOfDay } from '../date';
import { db } from '../db';
import type { PageRecord, SearchResult } from './types';

interface ParsedSearch {
  terms: string[];
  site?: string;
  after?: number;
  before?: number;
}

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

export async function searchPages(query: string, limit = 500): Promise<SearchResult[]> {
  const parsed = parseSearchQuery(query);
  if (
    parsed.terms.length === 0 &&
    !parsed.site &&
    parsed.after === undefined &&
    parsed.before === undefined
  ) {
    return [];
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
  return results.slice(0, limit);
}

export function getHighlightParts(
  text: string,
  terms: string[],
): Array<{ text: string; match: boolean }> {
  const normalizedTerms = terms.filter(Boolean);
  if (normalizedTerms.length === 0) return [{ text, match: false }];

  const pattern = normalizedTerms
    .slice()
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;

  for (const match of text.matchAll(regex)) {
    if (match.index === undefined) continue;
    if (match.index > cursor) parts.push({ text: text.slice(cursor, match.index), match: false });
    parts.push({ text: match[0], match: true });
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
