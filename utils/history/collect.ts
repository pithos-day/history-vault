import type { Browser } from 'wxt/browser';
import { browser } from 'wxt/browser';
import { db } from '../db';
import { getHost, isSupportedUrl } from '../url';
import { bumpVaultRevision } from '../vault-events';
import { normalizeSearchText } from './search';
import type { PageRecord, VisitRecord } from './types';

interface IngestOptions {
  source?: VisitRecord['source'];
  notify?: boolean;
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

  await db.transaction('rw', db.pages, db.visits, async () => {
    await db.pages.put(page);
    if (newVisits.length > 0) await db.visits.bulkPut(newVisits);
  });

  if (newVisits.length > 0 && options.notify !== false) {
    await bumpVaultRevision();
  }

  return { insertedVisits: newVisits.length, page };
}

export async function getVisitsSafe(url: string): Promise<Browser.history.VisitItem[]> {
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
