import { dayKey } from './date';
import { db } from './db';
import { recomputeActivityForDates } from './history/activity';
import { normalizeSearchText } from './history/search';
import { normalizeTitle } from './history/title';
import type { PageRecord, VisitRecord } from './history/types';
import { getHost } from './url';
import { bumpVaultRevision } from './vault-events';

interface VaultExport {
  format: 'history-vault';
  version: 1;
  exportedAt: string;
  pages: PageRecord[];
  visits: VisitRecord[];
}

interface VisitAggregate {
  count: number;
  first: number;
  last: number;
}

async function serializeVault(): Promise<string> {
  const [pages, visits] = await Promise.all([db.pages.toArray(), db.visits.toArray()]);
  const payload: VaultExport = {
    format: 'history-vault',
    version: 1,
    exportedAt: new Date().toISOString(),
    pages,
    visits,
  };

  return JSON.stringify(payload, null, 2);
}

export async function downloadVaultJson(): Promise<void> {
  const text = await serializeVault();
  downloadBlob(
    new Blob([text], { type: 'application/json' }),
    `history-vault-${dayKey(Date.now())}.json`,
  );
}

export async function downloadVaultCsv(): Promise<void> {
  const [pages, visits] = await Promise.all([db.pages.toArray(), db.visits.toArray()]);
  const pageMap = new Map(pages.map((page) => [page.url, page]));
  const lines = ['url,title,visitedAt,transition'];

  for (const visit of visits) {
    const page = pageMap.get(visit.url);
    lines.push(
      [
        csvCell(visit.url),
        csvCell(page?.title ?? ''),
        csvCell(new Date(visit.visitedAt).toISOString()),
        csvCell(visit.transition),
      ].join(','),
    );
  }

  downloadBlob(
    new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    `history-vault-${dayKey(Date.now())}.csv`,
  );
}

async function importVaultJson(
  text: string,
  onProgress?: (processed: number, total: number) => void,
): Promise<{ pages: number; visits: number }> {
  const parsed: unknown = JSON.parse(text);
  if (!isVaultExport(parsed)) throw new Error('History Vaultのエクスポート形式ではありません。');

  const total = parsed.pages.length + parsed.visits.length;
  let processed = 0;

  // Imported files can be partial (for example a backfill of one month). Keep
  // only visits whose ids are new and merge their counts into existing pages
  // instead of overwriting what the vault already knows.
  const aggregates = new Map<string, VisitAggregate>();
  const newVisits: VisitRecord[] = [];
  const activityDates = new Set<string>();

  for (let index = 0; index < parsed.visits.length; index += 500) {
    const chunk = parsed.visits.slice(index, index + 500);
    const existing = await db.visits.bulkGet(chunk.map((visit) => visit.id));

    for (let offset = 0; offset < chunk.length; offset += 1) {
      if (existing[offset]) continue;
      const visit = chunk[offset];
      if (!visit) continue;
      const aggregate = aggregates.get(visit.url);
      if (aggregate) {
        aggregate.count += 1;
        aggregate.first = Math.min(aggregate.first, visit.visitedAt);
        aggregate.last = Math.max(aggregate.last, visit.visitedAt);
      } else {
        aggregates.set(visit.url, {
          count: 1,
          first: visit.visitedAt,
          last: visit.visitedAt,
        });
      }
      newVisits.push(visit);
      activityDates.add(dayKey(visit.visitedAt));
    }

    processed += chunk.length;
    onProgress?.(processed, total);
  }

  for (let index = 0; index < parsed.pages.length; index += 500) {
    const chunk = parsed.pages.slice(index, index + 500);
    // Read and merge inside the same transaction so a live visit arriving
    // between the read and the write cannot lose its page count.
    await db.transaction('rw', db.pages, async () => {
      const existingPages = await db.pages.bulkGet(chunk.map((page) => page.url));
      const merged = chunk.map((page, offset) =>
        mergePage(page, existingPages[offset], aggregates.get(page.url)),
      );
      await db.pages.bulkPut(merged);
    });
    processed += chunk.length;
    onProgress?.(processed, total);
  }

  if (newVisits.length > 0) {
    await db.visits.bulkPut(newVisits);
    await recomputeActivityForDates(activityDates);
  }

  if (newVisits.length > 0 || parsed.pages.length > 0) await bumpVaultRevision();
  return { pages: parsed.pages.length, visits: newVisits.length };
}

/**
 * When a file only touches part of a page's history, its own first/last times
 * are just the bounds of the imported slice. Combine them with the record that
 * is already stored so the page keeps full-history aggregates.
 */
function mergePage(
  page: PageRecord,
  existing: PageRecord | undefined,
  aggregate: VisitAggregate | undefined,
): PageRecord {
  const url = page.url;
  const host = getHost(url);
  const fallback = {
    ...page,
    host,
    titleLower: normalizeSearchText(page.title),
    urlLower: normalizeSearchText(url),
  };

  if (!aggregate) {
    if (!existing) return fallback;

    const title = normalizeTitle(page.title, existing.title, url);
    return title === existing.title
      ? existing
      : { ...existing, title, titleLower: normalizeSearchText(title) };
  }

  const title = normalizeTitle(page.title, existing?.title, url);
  return {
    url,
    title,
    host,
    titleLower: normalizeSearchText(title),
    urlLower: normalizeSearchText(url),
    firstVisitTime: Math.min(existing?.firstVisitTime ?? aggregate.first, aggregate.first),
    lastVisitTime: Math.max(existing?.lastVisitTime ?? aggregate.last, aggregate.last),
    visitCount: (existing?.visitCount ?? 0) + aggregate.count,
  };
}

export async function importVaultFile(
  file: File,
  onProgress?: (processed: number, total: number) => void,
): Promise<{ pages: number; visits: number }> {
  return importVaultJson(await file.text(), onProgress);
}

function isVaultExport(value: unknown): value is VaultExport {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Partial<VaultExport>;
  return (
    payload.format === 'history-vault' &&
    payload.version === 1 &&
    Array.isArray(payload.pages) &&
    Array.isArray(payload.visits) &&
    payload.pages.every(isPageRecord) &&
    payload.visits.every(isVisitRecord)
  );
}

function isPageRecord(value: unknown): value is PageRecord {
  if (typeof value !== 'object' || value === null) return false;
  const page = value as Partial<PageRecord>;
  return (
    typeof page.url === 'string' &&
    typeof page.title === 'string' &&
    typeof page.host === 'string' &&
    typeof page.lastVisitTime === 'number' &&
    typeof page.firstVisitTime === 'number' &&
    typeof page.visitCount === 'number'
  );
}

function isVisitRecord(value: unknown): value is VisitRecord {
  if (typeof value !== 'object' || value === null) return false;
  const visit = value as Partial<VisitRecord>;
  return (
    typeof visit.id === 'string' &&
    typeof visit.url === 'string' &&
    typeof visit.host === 'string' &&
    typeof visit.visitedAt === 'number' &&
    typeof visit.transition === 'string' &&
    (visit.source === 'live' || visit.source === 'import' || visit.source === 'fallback')
  );
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
