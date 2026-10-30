import type { Browser } from 'wxt/browser';
import { browser } from 'wxt/browser';
import { db } from '../db';
import { getHost, isSupportedUrl } from '../url';
import { bumpVaultRevision } from '../vault-events';
import { getVaultEpoch } from './epoch';
import { normalizeSearchText } from './search';
import type { PageRecord, VisitRecord } from './types';

interface IngestOptions {
  source?: VisitRecord['source'];
  notify?: boolean;
  /**
   * Import batches capture the vault generation up front. If the vault is
   * cleared while a batch is in flight, the write transaction refuses to
   * resurrect the deleted rows.
   */
  expectedEpoch?: number;
}

export interface IngestResult {
  insertedVisits: number;
  page: PageRecord | null;
}

export async function ingestHistoryItem(
  item: Browser.history.HistoryItem,
  options: IngestOptions = {},
): Promise<IngestResult> {
  const url = item.url;
  if (!isSupportedUrl(url)) return { insertedVisits: 0, page: null };

  const host = getHost(url);
  const existingPage = await db.pages.get(url);
  const visitItems = await getVisitsSafe(url);
  const visits = toVisitRecords(url, host, visitItems, options.source ?? 'live');

  if (visits.length === 0 && item.lastVisitTime) {
    visits.push({
      id: `fallback:${url}:${item.lastVisitTime}`,
      url,
      host,
      visitedAt: item.lastVisitTime,
      transition: 'link',
      source: 'fallback',
    });
  }

  const existingVisits = await db.visits.bulkGet(visits.map((visit) => visit.id));
  const newVisits = visits.filter((_, index) => !existingVisits[index]);
  const latestVisit = visits.reduce(
    (latest, visit) => Math.max(latest, visit.visitedAt),
    existingPage?.lastVisitTime ?? 0,
  );
  const firstVisit = visits.reduce(
    (first, visit) => Math.min(first, visit.visitedAt),
    existingPage?.firstVisitTime ?? Number.POSITIVE_INFINITY,
  );
  const title = item.title?.trim() || existingPage?.title || '';
  const titleChanged = existingPage?.title !== title;

  const page: PageRecord = {
    url,
    title,
    host,
    titleLower: normalizeSearchText(title),
    urlLower: normalizeSearchText(url),
    lastVisitTime: Math.max(latestVisit, item.lastVisitTime ?? 0),
    firstVisitTime: Number.isFinite(firstVisit) ? firstVisit : latestVisit,
    visitCount: Math.max(existingPage?.visitCount ?? 0, item.visitCount ?? 0, visits.length),
  };

  const written = await db.transaction('rw', db.pages, db.visits, db.meta, async () => {
    if (options.expectedEpoch !== undefined) {
      const epoch = await getVaultEpoch();
      if (epoch !== options.expectedEpoch) return null;
    }

    await db.pages.put(page);
    if (newVisits.length > 0) await db.visits.bulkPut(newVisits);
    return newVisits.length;
  });

  if (written === null) return { insertedVisits: 0, page: null };

  if ((written > 0 || titleChanged) && options.notify !== false) {
    await bumpVaultRevision();
  }

  return { insertedVisits: written, page };
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
    if (!visit.visitTime) continue;
    records.push({
      id: visit.visitId,
      url,
      host,
      visitedAt: visit.visitTime,
      transition: visit.transition,
      referringVisitId: visit.referringVisitId || undefined,
      isLocal: visit.isLocal,
      source,
    });
  }

  return records;
}
