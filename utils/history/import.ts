import { browser } from 'wxt/browser';
import { endOfDay, startOfDay } from '../date';
import { getSettings } from '../settings';
import { bumpVaultRevision } from '../vault-events';
import { ingestHistoryItem } from './collect';
import { getVaultEpoch } from './epoch';
import type { ImportState } from './types';

export const IMPORT_STATE_KEY = 'importState';
const IMPORT_LOCK_KEY = 'importLock';

const DAY_MS = 86_400_000;
const MAX_DAYS = 3650;
const LOCK_TTL_MS = 2 * 60 * 1000;
const SEARCH_MAX_RESULTS = 5000;
const IMPORT_BATCH_MS = 15_000;

interface ImportLock {
  owner: string;
  expiresAt: number;
}

class ImportCancelledError extends Error {
  constructor() {
    super('Import cancelled');
    this.name = 'ImportCancelledError';
  }
}

export function defaultImportState(now = Date.now()): ImportState {
  return {
    phase: 'idle',
    startedAt: now,
    updatedAt: now,
    cursorEnd: endOfDay(now).getTime(),
    windowStart: startOfDay(now).getTime(),
    daysDone: 0,
    daysTotal: 0,
    pages: 0,
    visits: 0,
    emptyStreak: 0,
  };
}

export async function getImportState(): Promise<ImportState> {
  const result = await browser.storage.local.get(IMPORT_STATE_KEY);
  const value = result[IMPORT_STATE_KEY];
  return isImportState(value) ? value : defaultImportState();
}

export async function startImport(
  options: { reset?: boolean; windowDays?: number } = {},
): Promise<ImportState> {
  const current = await getImportState();
  const reset = options.reset ?? false;

  if (current.phase === 'running' && !reset) return current;
  if (current.phase === 'done' && !reset) return current;

  const settings = await getSettings();
  const windowDays = options.windowDays ?? settings.importWindowDays;
  const now = Date.now();
  const cursorEnd = endOfDay(now).getTime();
  const windowStart = windowDays > 0 ? startOfDay(now - windowDays * DAY_MS).getTime() : 0;
  const daysTotal =
    windowDays > 0 ? Math.max(1, Math.ceil((cursorEnd - windowStart) / DAY_MS)) : MAX_DAYS;

  const initialize = reset || current.phase === 'idle' || current.daysTotal === 0;
  const state: ImportState = initialize
    ? {
        phase: 'running',
        startedAt: now,
        updatedAt: now,
        cursorEnd,
        windowStart,
        daysDone: 0,
        daysTotal,
        pages: 0,
        visits: 0,
        emptyStreak: 0,
      }
    : {
        ...current,
        phase: 'running',
        updatedAt: now,
        error: undefined,
      };

  await saveImportState(state);
  return state;
}

export async function ensureImportStarted(): Promise<ImportState> {
  const state = await getImportState();
  if (state.phase === 'done' || state.phase === 'running') return state;
  return startImport();
}

export async function runImportBatch(batchSize = 80): Promise<ImportState> {
  let state = await getImportState();
  if (state.phase !== 'running') return state;

  const owner = await acquireImportLock();
  if (!owner) return state;

  const epoch = await getVaultEpoch();
  const startedAt = Date.now();

  try {
    let pagesProcessed = 0;

    while (state.phase === 'running') {
      const latest = await getImportState();
      if (latest.phase !== 'running') {
        state = latest;
        break;
      }

      if (state.cursorEnd <= state.windowStart) {
        state = { ...state, phase: 'done', updatedAt: Date.now() };
        break;
      }

      const dayEnd = state.cursorEnd;
      const dayStart = Math.max(startOfDay(dayEnd - 1).getTime(), state.windowStart);
      const processed = await processRange(dayStart, dayEnd, epoch, owner);

      const current = await getImportState();
      if (current.phase !== 'running' || (await getVaultEpoch()) !== epoch) {
        state = current;
        break;
      }

      state = {
        ...current,
        cursorEnd: dayStart,
        daysDone: current.daysDone + 1,
        pages: current.pages + processed.pages,
        visits: current.visits + processed.visits,
        emptyStreak: processed.pages > 0 ? 0 : current.emptyStreak + 1,
        updatedAt: Date.now(),
      };

      pagesProcessed += processed.pages;
      await saveImportState(state);
      await bumpVaultRevision();

      if (state.windowStart === 0 && state.emptyStreak >= 60 && state.daysDone > 0) {
        state = { ...state, phase: 'done', updatedAt: Date.now() };
        break;
      }

      if (pagesProcessed >= batchSize) break;
      if (Date.now() - startedAt >= IMPORT_BATCH_MS) break;

      if (!(await renewImportLock(owner))) break;
    }

    if (state.phase === 'done' && (await getVaultEpoch()) === epoch) {
      state = { ...state, updatedAt: Date.now() };
      await saveImportState(state);
      await bumpVaultRevision();
    }

    return state;
  } catch (error) {
    if (error instanceof ImportCancelledError) {
      return getImportState();
    }

    state = {
      ...state,
      phase: 'error',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now(),
    };
    await saveImportState(state);
    return state;
  } finally {
    await releaseImportLock(owner);
  }
}

export async function cancelImport(): Promise<void> {
  const state = await getImportState();
  await saveImportState({ ...state, phase: 'idle', updatedAt: Date.now() });
  await releaseImportLock('');
}

/**
 * Waits for the current batch to release the import lock. Combined with the
 * vault epoch check, this lets a clear finish without an in-flight batch
 * resurrecting rows or overwriting the final import state.
 */
export async function waitForImportLockRelease(timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await browser.storage.local.get(IMPORT_LOCK_KEY);
    const current = result[IMPORT_LOCK_KEY] as ImportLock | undefined;
    if (!current || current.expiresAt <= Date.now()) return true;
    await delay(100);
  }

  return false;
}

export async function saveImportState(state: ImportState): Promise<void> {
  await browser.storage.local.set({ [IMPORT_STATE_KEY]: state });
}

async function processRange(
  start: number,
  end: number,
  epoch: number,
  owner: string,
): Promise<{ pages: number; visits: number }> {
  if (!(await isImportLockHeld(owner))) throw new ImportCancelledError();

  const items = await browser.history.search({
    text: '',
    startTime: start,
    endTime: end,
    maxResults: SEARCH_MAX_RESULTS,
  });

  if (items.length >= SEARCH_MAX_RESULTS && end - start > 3_600_000) {
    const middle = start + Math.floor((end - start) / 2);
    const left = await processRange(start, middle, epoch, owner);
    const right = await processRange(middle, end, epoch, owner);
    return { pages: left.pages + right.pages, visits: left.visits + right.visits };
  }

  let visits = 0;
  let matchedPages = 0;

  for (let index = 0; index < items.length; index += 8) {
    if (!(await isImportLockHeld(owner))) throw new ImportCancelledError();

    const chunk = items.slice(index, index + 8);
    const results = await Promise.all(
      chunk.map((item) =>
        ingestHistoryItem(item, {
          source: 'import',
          notify: false,
          since: start,
          until: end,
          expectedEpoch: epoch,
        }),
      ),
    );
    matchedPages += results.filter((result) => result.matchedVisits > 0).length;
    visits += results.reduce((total, result) => total + result.insertedVisits, 0);
  }

  return { pages: matchedPages, visits };
}

async function isImportLockHeld(owner: string): Promise<boolean> {
  const result = await browser.storage.local.get(IMPORT_LOCK_KEY);
  const current = result[IMPORT_LOCK_KEY] as ImportLock | undefined;
  return Boolean(current && current.owner === owner && current.expiresAt > Date.now());
}

async function acquireImportLock(): Promise<string | null> {
  const result = await browser.storage.local.get(IMPORT_LOCK_KEY);
  const current = result[IMPORT_LOCK_KEY] as ImportLock | undefined;
  const now = Date.now();

  if (current && current.expiresAt > now) return null;

  const owner = crypto.randomUUID();
  await browser.storage.local.set({
    [IMPORT_LOCK_KEY]: { owner, expiresAt: now + LOCK_TTL_MS } satisfies ImportLock,
  });
  return owner;
}

async function renewImportLock(owner: string): Promise<boolean> {
  const result = await browser.storage.local.get(IMPORT_LOCK_KEY);
  const current = result[IMPORT_LOCK_KEY] as ImportLock | undefined;
  if (!current || current.owner !== owner || current.expiresAt <= Date.now()) return false;

  await browser.storage.local.set({
    [IMPORT_LOCK_KEY]: { owner, expiresAt: Date.now() + LOCK_TTL_MS } satisfies ImportLock,
  });
  return true;
}

async function releaseImportLock(owner: string): Promise<void> {
  const result = await browser.storage.local.get(IMPORT_LOCK_KEY);
  const current = result[IMPORT_LOCK_KEY] as ImportLock | undefined;
  if (!current) return;
  if (owner && current.owner !== owner) return;
  await browser.storage.local.remove(IMPORT_LOCK_KEY);
}

export function isImportState(value: unknown): value is ImportState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { phase?: unknown }).phase === 'string' &&
    typeof (value as { cursorEnd?: unknown }).cursorEnd === 'number'
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
