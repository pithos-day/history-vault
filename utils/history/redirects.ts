import { db } from '../db';
import type { RedirectMarker } from './types';
import { REDIRECT_WINDOW, windowAroundSpan } from './visit-windows';

const REDIRECT_MARKERS_KEY = 'redirectMarkers';
const MARKER_TTL_MS = 90 * 86_400_000;
const MAX_MARKERS = 200;

export interface NavigationSnapshot {
  url: string;
  time: number;
}

export interface RedirectSource {
  url: string;
  from: number;
  to: number;
}

export interface RedirectChainVisit {
  id: string;
  url: string;
  visitedAt: number;
  referringVisitId?: string;
}

/**
 * Chromium writes every hop of a redirect chain with the same visit time and
 * points each hop at the previous one through referringVisitId. Chrome shows
 * only the chain end in its history page, and Vivaldi's private history query
 * hides the intermediate hops. The extension API exposes neither chain marker,
 * but the timestamp and referring id are still enough to rebuild the chain.
 */
export function findSupersededRedirectVisitIds(visits: readonly RedirectChainVisit[]): string[] {
  const byTime = new Map<number, Map<string, RedirectChainVisit>>();

  for (const visit of visits) {
    let group = byTime.get(visit.visitedAt);
    if (!group) {
      group = new Map();
      byTime.set(visit.visitedAt, group);
    }
    group.set(visit.id, visit);
  }

  const ids = new Set<string>();

  for (const group of byTime.values()) {
    for (const visit of group.values()) {
      const previous = visit.referringVisitId ? group.get(visit.referringVisitId) : undefined;

      // Ignore reloads, self-redirects and synthetic fallback visits. A real
      // chain keeps moving forward through increasing visit IDs.
      if (!previous || previous.url === visit.url) continue;
      if (!isLaterVisit(visit.id, previous.id)) continue;
      ids.add(previous.id);
    }
  }

  return [...ids];
}

function isLaterVisit(id: string, previousId: string): boolean {
  const current = Number(id);
  const previous = Number(previousId);
  return Number.isFinite(current) && Number.isFinite(previous) && current > previous;
}

/**
 * Finds the URL that should be treated as an intermediate redirect page.
 * Server redirects never commit the source document, so the pending
 * navigation is the source. Client redirects commit a document first, so the
 * previous committed URL is the source.
 */
export function findRedirectSource(input: {
  targetUrl: string;
  targetTime: number;
  qualifiers: readonly string[];
  lastBeforeNavigate?: NavigationSnapshot;
  lastCommitted?: NavigationSnapshot;
}): RedirectSource | null {
  const isServerRedirect = input.qualifiers.includes('server_redirect');
  const isClientRedirect = input.qualifiers.includes('client_redirect');
  if (!isServerRedirect && !isClientRedirect) return null;

  const candidate = isServerRedirect ? input.lastBeforeNavigate : input.lastCommitted;
  if (!candidate || candidate.url === input.targetUrl) return null;

  return {
    url: candidate.url,
    ...windowAroundSpan(candidate.time, input.targetTime, REDIRECT_WINDOW),
  };
}

export function isRedirectedVisit(
  markers: readonly RedirectMarker[],
  url: string,
  visitedAt: number,
): boolean {
  return markers.some(
    (marker) => marker.url === url && visitedAt >= marker.from && visitedAt <= marker.to,
  );
}

let markerCache: RedirectMarker[] | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function loadRedirectMarkers(): Promise<RedirectMarker[]> {
  if (markerCache) return markerCache;
  return refreshRedirectMarkers();
}

export async function refreshRedirectMarkers(): Promise<RedirectMarker[]> {
  const record = await db.meta.get(REDIRECT_MARKERS_KEY);
  markerCache = pruneRedirectMarkers(normalizeRedirectMarkers(record?.value));
  return markerCache;
}

export function getCachedRedirectMarkers(): RedirectMarker[] {
  return markerCache ?? [];
}

export async function addRedirectMarker(marker: RedirectMarker): Promise<void> {
  const markers = await loadRedirectMarkers();
  markerCache = pruneRedirectMarkers([...markers, marker]);

  writeQueue = writeQueue
    .then(() => db.meta.put({ key: REDIRECT_MARKERS_KEY, value: markerCache }))
    .then(() => undefined)
    .catch(() => undefined);
  await writeQueue;
}

export function resetRedirectMarkersCache(): void {
  markerCache = null;
}

export function pruneRedirectMarkers(
  markers: readonly RedirectMarker[],
  now = Date.now(),
): RedirectMarker[] {
  return markers.filter((marker) => marker.to >= now - MARKER_TTL_MS).slice(-MAX_MARKERS);
}

function normalizeRedirectMarkers(value: unknown): RedirectMarker[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (marker): marker is RedirectMarker =>
      typeof marker === 'object' &&
      marker !== null &&
      typeof (marker as RedirectMarker).url === 'string' &&
      typeof (marker as RedirectMarker).from === 'number' &&
      typeof (marker as RedirectMarker).to === 'number',
  );
}
