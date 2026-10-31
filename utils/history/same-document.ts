import { isUrlLikeTitle, isUsableTitle } from './title';

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
const WINDOW_BEFORE_MS = 2_000;
const WINDOW_AFTER_MS = 3_000;

export function suppressVisit(
  markers: readonly SuppressedVisit[],
  url: string,
  visitedAt: number,
  now = Date.now(),
): SuppressedVisit[] {
  const marker: SuppressedVisit = {
    url,
    from: visitedAt - WINDOW_BEFORE_MS,
    to: visitedAt + WINDOW_AFTER_MS,
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
 * before this extension learned to collapse them. The chain is deliberately
 * conservative: same origin and path, a link visit with an unusable title, and
 * a later titled link visit within five seconds. URL-titled visits qualify even
 * when Chrome reports a referring visit; empty-titled ones need no referrer.
 */
export function findSupersededVisitIds(visits: readonly SameDocumentVisit[]): string[] {
  const groups = new Map<string, SameDocumentVisit[]>();

  for (const visit of visits) {
    if (visit.transition !== 'link') continue;

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
      if (!isSupersededCandidate(visit)) continue;

      const replacement = group
        .slice(index + 1)
        .find(
          (candidate) =>
            candidate.url !== visit.url &&
            candidate.visitedAt - visit.visitedAt <= CHAIN_WINDOW_MS &&
            candidate.visitedAt >= visit.visitedAt &&
            isUsableTitle(candidate.title, candidate.url),
        );

      if (replacement) ids.push(visit.id);
    }
  }

  return ids;
}

function isSupersededCandidate(visit: SameDocumentVisit): boolean {
  if (isUrlLikeTitle(visit.title, visit.url)) return true;
  return !visit.referringVisitId || visit.referringVisitId === '0';
}

function canonicalPageKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return null;
  }
}
