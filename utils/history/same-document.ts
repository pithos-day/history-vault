import { isUsableTitle } from './title';
import { SAME_DOCUMENT_WINDOW, windowAround } from './visit-windows';

export const RECENT_CLEANUP_MS = 7 * 86_400_000;

/**
 * Same-document navigations (pushState / replaceState / fragment updates) also
 * fire chrome.history.onVisited. Chrome treats each URL as a separate visit,
 * even though no new page was loaded. Keeping every URL creates long chains of
 * tracking-parameter variants, so only the latest URL in the chain is kept.
 */
export interface SuppressedVisit {
  url: string;
  from: number;
  to: number;
}

const MARKER_TTL_MS = 60_000;
const MAX_MARKERS = 200;

export function suppressVisit(
  markers: readonly SuppressedVisit[],
  url: string,
  visitedAt: number,
  now = Date.now(),
): SuppressedVisit[] {
  const marker: SuppressedVisit = {
    url,
    ...windowAround(visitedAt, SAME_DOCUMENT_WINDOW),
  };

  return pruneSuppressedVisits([...markers, marker], now);
}

export function isSuppressedVisit(
  markers: readonly SuppressedVisit[],
  url: string,
  visitedAt: number,
): boolean {
  return markers.some(
    (marker) => marker.url === url && visitedAt >= marker.from && visitedAt <= marker.to,
  );
}

export function pruneSuppressedVisits(
  markers: readonly SuppressedVisit[],
  now = Date.now(),
): SuppressedVisit[] {
  return markers.filter((marker) => marker.to >= now - MARKER_TTL_MS).slice(-MAX_MARKERS);
}

export interface SameDocumentVisit {
  id: string;
  url: string;
  visitedAt: number;
  transition: string;
  referringVisitId?: string;
  title?: string;
}

const CHAIN_WINDOW_MS = 5000;

/**
 * Finds older visits that belong to a same-document URL chain but were written
 * before this extension learned to collapse them. Visits are only grouped when
 * the URLs differ but share at least one query value, which is typical of a
 * page rewriting its tracking parameters. An untitled/URL-titled visit is
 * removed when a titled visit to that same page follows within five seconds.
 * Titled visits are also removed when the later URL only adds or changes
 * tracking parameters while every meaningful query value stays the same.
 */
export function findSupersededVisitIds(visits: readonly SameDocumentVisit[]): string[] {
  const groups = new Map<string, SameDocumentVisit[]>();

  for (const visit of visits) {
    const key = canonicalPageKey(visit.url);
    if (!key) continue;

    const group = groups.get(key);
    if (group) group.push(visit);
    else groups.set(key, [visit]);
  }

  const ids: string[] = [];

  for (const group of groups.values()) {
    group.sort((left, right) => left.visitedAt - right.visitedAt);

    for (const [index, visit] of group.entries()) {
      const titled = isUsableTitle(visit.title, visit.url);
      const replacement = group
        .slice(index + 1)
        .find((candidate) => isReplacementFor(visit, candidate, titled));

      if (replacement) ids.push(visit.id);
    }
  }

  return ids;
}

function isReplacementFor(
  previous: SameDocumentVisit,
  candidate: SameDocumentVisit,
  titled: boolean,
): boolean {
  if (candidate.url === previous.url) return false;
  if (candidate.visitedAt < previous.visitedAt) return false;
  if (candidate.visitedAt - previous.visitedAt > CHAIN_WINDOW_MS) return false;
  if (!isUsableTitle(candidate.title, candidate.url)) return false;

  return titled
    ? isTrackingOnlyVariant(previous.url, candidate.url)
    : sharesQueryValue(previous.url, candidate.url);
}

function sharesQueryValue(leftUrl: string, rightUrl: string): boolean {
  try {
    const left = new URL(leftUrl);
    const right = new URL(rightUrl);
    if (left.search === '' && right.search === '') return true;

    for (const [key, value] of left.searchParams) {
      if (right.searchParams.get(key) === value) return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Tracking parameters are rewritten in place by scripts without navigating,
 * so the URL changes while the page (and its title) stays the same.
 */
const TRACKING_PARAMS = new Set([
  'biw',
  'bih',
  'dclid',
  'ei',
  'fbclid',
  'gclid',
  'gbraid',
  'gs_lcp',
  'gs_mss',
  'gs_ssp',
  'ie',
  'mc_cid',
  'mc_eid',
  'msclkid',
  'oq',
  'rlz',
  'sa',
  'sca_esv',
  'sclient',
  'source',
  'spm',
  'sxsrf',
  'uact',
  'ved',
  'wbraid',
  'yclid',
]);

const TRACKING_PREFIXES = ['utm_', 'at_', 'pk_', 'mtm_'];

function isTrackingParam(key: string): boolean {
  const name = key.toLowerCase();
  return TRACKING_PARAMS.has(name) || TRACKING_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Returns true when two URLs address the same page and only differ in query
 * parameters that carry no meaning (tracking, session, viewport hints, ...).
 * Every other query key must be present on both URLs with the same value, so
 * changes such as `q=white` -> `q=black` or `page=1` -> `page=2` are kept.
 */
function isTrackingOnlyVariant(leftUrl: string, rightUrl: string): boolean {
  try {
    const left = new URL(leftUrl);
    const right = new URL(rightUrl);
    if (left.origin !== right.origin || left.pathname !== right.pathname) return false;
    if (left.search === right.search) return false;

    const keys = new Set([...left.searchParams.keys(), ...right.searchParams.keys()]);

    for (const key of keys) {
      if (isTrackingParam(key)) continue;
      const leftValue = left.searchParams.get(key);
      const rightValue = right.searchParams.get(key);
      if (leftValue === null || rightValue === null || leftValue !== rightValue) return false;
    }

    return true;
  } catch {
    return false;
  }
}

function canonicalPageKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return null;
  }
}
