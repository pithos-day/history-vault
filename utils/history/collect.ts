import type { Browser } from 'wxt/browser';
import { browser } from 'wxt/browser';
import { dayKey } from '../date';
import { db } from '../db';
import { getHost, isSupportedUrl } from '../url';
import { bumpVaultRevision } from '../vault-events';
import { addVisitsToActivity } from './activity';
import { getVaultEpoch } from './epoch';
import { isRedirectedVisit } from './redirects';
import { normalizeSearchText } from './search';
import { normalizeTitle } from './title';
import type { PageRecord, RedirectMarker, VisitRecord } from './types';

interface IngestOptions {
  source?: VisitRecord['source'];
  notify?: boolean;
  /** Inclusive lower bound for visits (used by windowed imports). */
  since?: number;
  /** Exclusive upper bound for visits (used by windowed imports). */
  until?: number;
  /** Visits matching a detected redirect intermediate are skipped. */
  redirects?: readonly RedirectMarker[];
  /**
   * Import batches capture the vault generation up front. If the vault is
   * cleared while a batch is in flight, the write transaction refuses to
   * resurrect the deleted rows.
   */
  expectedEpoch?: number;
}

export interface IngestResult {
  insertedVisits: number;
  matchedVisits: number;
  page: PageRecord | null;
}

export async function ingestHistoryItem(
  item: Browser.history.HistoryItem,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const url = item.url;
  if (!isSupportedUrl(url)) return { insertedVisits: 0, matchedVisits: 0, page: null };

  const host = getHost(url);
  const existingPage = await db.pages.get(url);
  const visitItems = await getVisitsSafe(url);
  const visits = resolveVisits(url, host, visitItems, item, options);

  // A page can be returned by history.search even when none of its visits fall
  // inside the requested window. Never let that update page metadata: doing so
  // attaches the current title/URL to old dates and keeps the import running
  // through empty history forever.
  if (visits.length === 0) return { insertedVisits: 0, matchedVisits: 0, page: null };

  const existingVisits = await db.visits.bulkGet(visits.map((visit) => visit.id));
  const newVisits = visits.filter((_, index) => !existingVisits[index]);
  const existingLast = isValidTimestamp(existingPage?.lastVisitTime)
    ? existingPage.lastVisitTime
    : 0;
  const existingFirst = isValidTimestamp(existingPage?.firstVisitTime)
    ? existingPage.firstVisitTime
    : Number.POSITIVE_INFINITY;
  const latestVisit = visits.reduce(
    (latest, visit) => Math.max(latest, visit.visitedAt),
    existingLast,
  );
  const firstVisit = visits.reduce(
    (first, visit) => Math.min(first, visit.visitedAt),
    existingFirst,
  );
  const title = normalizeTitle(item.title, existingPage?.title, url);
  const titleChanged = existingPage?.title !== title;

  const page: PageRecord = {
    url,
    title,
    host,
    titleLower: normalizeSearchText(title),
    urlLower: normalizeSearchText(url),
    lastVisitTime: latestVisit,
    firstVisitTime: Number.isFinite(firstVisit) ? firstVisit : latestVisit,
    visitCount: (existingPage?.visitCount ?? 0) + newVisits.length,
  };

  const written = await db.transaction(
    'rw',
    db.pages,
    db.visits,
    db.activity,
    db.meta,
    async () => {
      if (options.expectedEpoch !== undefined) {
        const epoch = await getVaultEpoch();
        if (epoch !== options.expectedEpoch) return null;
      }

      await db.pages.put(page);
      if (newVisits.length > 0) {
        await addVisitsToActivity(newVisits);
        await db.visits.bulkPut(newVisits);
      }
      return newVisits.length;
    },
  );

  if (written === null) return { insertedVisits: 0, matchedVisits: 0, page: null };

  if ((written > 0 || titleChanged) && options.notify !== false) {
    await bumpVaultRevision({
      days: (newVisits.length > 0 ? newVisits : visits).map((visit) => dayKey(visit.visitedAt)),
    });
  }

  return { insertedVisits: written, matchedVisits: visits.length, page };
}

/**
 * Converts Chrome's visit list into records for the requested window. The
 * fallback is only allowed when Chrome returned no usable visits at all and
 * the item's own timestamp is inside the window; otherwise a page whose last
 * visit is today would be written into every older day being imported.
 */
export function resolveVisits(
  url: string,
  host: string,
  visitItems: Browser.history.VisitItem[],
  item: Browser.history.HistoryItem,
  options: Pick<IngestOptions, 'source' | 'since' | 'until' | 'redirects'> = {},
): VisitRecord[] {
  const allVisits = toVisitRecords(url, host, visitItems, options.source ?? 'live');
  const visits = allVisits.filter(
    (visit) =>
      isWithinWindow(visit.visitedAt, options) &&
      !isRedirectedVisit(options.redirects ?? [], visit.url, visit.visitedAt),
  );
  if (visits.length > 0) return visits;

  const fallbackTime = item.lastVisitTime;
  if (
    allVisits.length === 0 &&
    isValidTimestamp(fallbackTime) &&
    isWithinWindow(fallbackTime, options)
  ) {
    return [
      {
        id: `fallback:${url}:${fallbackTime}`,
        url,
        host,
        visitedAt: fallbackTime,
        transition: 'link',
        source: 'fallback',
      },
    ];
  }

  return [];
}

function isWithinWindow(time: number, options: Pick<IngestOptions, 'since' | 'until'>): boolean {
  return (
    (options.since === undefined || time >= options.since) &&
    (options.until === undefined || time < options.until)
  );
}

function isValidTimestamp(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

async function getVisitsSafe(url: string): Promise<Browser.history.VisitItem[]> {
  try {
    return await browser.history.getVisits({ url });
  } catch {
    return [];
  }
}

function toVisitRecords(
  url: string,
  host: string,
  visits: Browser.history.VisitItem[],
  source: VisitRecord['source'],
): VisitRecord[] {
  const records: VisitRecord[] = [];

  for (const visit of visits) {
    if (!isValidTimestamp(visit.visitTime)) continue;
    records.push({
      id: visit.visitId,
      url,
      host,
      visitedAt: visit.visitTime,
      transition: visit.transition,
      referringVisitId: visit.referringVisitId || undefined,
      source,
    });
  }

  return records;
}
