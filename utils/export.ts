import { dayKey } from './date';
import { db } from './db';
import type { PageRecord, VisitRecord } from './history/types';
import { bumpVaultRevision } from './vault-events';

interface VaultExport {
  format: 'history-vault';
  version: 1;
  exportedAt: string;
  pages: PageRecord[];
  visits: VisitRecord[];
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

  for (let index = 0; index < parsed.pages.length; index += 500) {
    const chunk = parsed.pages.slice(index, index + 500);
    await db.pages.bulkPut(chunk);
    processed += chunk.length;
    onProgress?.(processed, total);
  }

  for (let index = 0; index < parsed.visits.length; index += 500) {
    const chunk = parsed.visits.slice(index, index + 500);
    await db.visits.bulkPut(chunk);
    processed += chunk.length;
    onProgress?.(processed, total);
  }

  await bumpVaultRevision();
  return { pages: parsed.pages.length, visits: parsed.visits.length };
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
