import type { Browser } from 'wxt/browser';
import type { PageRecord, VisitRecord } from '../utils/history/types';

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ja-JP');
}

export function pageRecord(
  url: string,
  lastVisitTime: number,
  overrides: Partial<PageRecord> = {},
): PageRecord {
  const title = overrides.title ?? url;
  return {
    url,
    title,
    host: new URL(url).host,
    titleLower: normalize(title),
    urlLower: normalize(url),
    lastVisitTime,
    firstVisitTime: lastVisitTime,
    visitCount: 1,
    ...overrides,
  };
}

export function visitRecord(
  id: string,
  url: string,
  visitedAt: number,
  overrides: Partial<VisitRecord> = {},
): VisitRecord {
  return {
    id,
    url,
    host: new URL(url).host,
    visitedAt,
    transition: 'link',
    source: 'live',
    ...overrides,
  };
}

export function browserVisit(
  visitId: string,
  visitTime: number,
  overrides: Partial<Browser.history.VisitItem> = {},
): Browser.history.VisitItem {
  return {
    id: 'page',
    visitId,
    visitTime,
    transition: 'link',
    referringVisitId: '0',
    isLocal: true,
    ...overrides,
  };
}
