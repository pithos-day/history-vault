import type { Browser } from 'wxt/browser';
import { browser } from 'wxt/browser';
import { parseDayKey } from '@/utils/date';
import { ingestHistoryItem } from '@/utils/history/collect';
import {
  cancelImport,
  defaultImportState,
  ensureImportStarted,
  IMPORT_STATE_KEY,
  runImportBatch,
  saveImportState,
  startImport,
  waitForImportLockRelease,
} from '@/utils/history/import';
import {
  clearVaultData,
  deleteDayFromVault,
  deleteUrlFromVault,
  deleteUrlVisitsBetween,
  removeSupersededSameDocumentVisits,
} from '@/utils/history/query';
import {
  addRedirectMarker,
  findRedirectSource,
  getCachedRedirectMarkers,
  isRedirectedVisit,
  loadRedirectMarkers,
  type NavigationSnapshot,
  type RedirectSource,
  resetRedirectMarkersCache,
} from '@/utils/history/redirects';
import {
  isSuppressedVisit,
  RECENT_CLEANUP_MS,
  type SuppressedVisit,
  suppressVisit,
} from '@/utils/history/same-document';
import type { ImportState } from '@/utils/history/types';
import type { VaultRequest } from '@/utils/messages';
import { isVaultRequest } from '@/utils/messages';
import { ensureDefaultSettings, getSettings } from '@/utils/settings';

const IMPORT_ALARM = 'history-vault-import';

interface NavigationState {
  before?: NavigationSnapshot;
  committed?: NavigationSnapshot;
  /** The latest URL in a same-document navigation chain for this tab. */
  chainHead?: NavigationSnapshot;
}

const navigationStates = new Map<string, NavigationState>();
let suppressedVisits: SuppressedVisit[] = [];

export default defineBackground(() => {
  void loadRedirectMarkers();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    void handleInstalled(reason);
  });

  browser.runtime.onStartup.addListener(() => {
    void handleStartup();
  });

  browser.history.onVisited.addListener((item) => {
    void storeVisitedItem(item).catch((error) => {
      console.error('History Vault: failed to store visit', error);
    });
  });

  browser.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) return;
    const state = getNavigationState(details.tabId, details.frameId);
    state.before = { url: details.url, time: details.timeStamp };
  });

  browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    const state = getNavigationState(details.tabId, details.frameId);
    const source = findRedirectSource({
      targetUrl: details.url,
      targetTime: details.timeStamp,
      qualifiers: details.transitionQualifiers ?? [],
      lastBeforeNavigate: state.before,
      lastCommitted: state.committed,
    });

    state.committed = { url: details.url, time: details.timeStamp };
    state.chainHead = state.committed;

    if (source) {
      void handleRedirectSource(source).catch((error) => {
        console.error('History Vault: failed to drop redirect page', error);
      });
    }
  });

  browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
    handleSameDocumentNavigation(details);
  });

  browser.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
    handleSameDocumentNavigation(details);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    const prefix = `${tabId}:`;
    for (const key of navigationStates.keys()) {
      if (key.startsWith(prefix)) navigationStates.delete(key);
    }
  });

  browser.history.onVisitRemoved.addListener((removed) => {
    void handleVisitRemoved(removed).catch((error) => {
      console.error('History Vault: failed to mirror history removal', error);
    });
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    void handleAlarm(alarm.name);
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isVaultRequest(message)) return false;

    void handleRequest(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const change = changes[IMPORT_STATE_KEY];
    if (change && isImportState(change.newValue)) void syncBadge(change.newValue);
  });
});

async function handleInstalled(reason: string): Promise<void> {
  await ensureDefaultSettings();
  await ensureAlarms();

  if (reason === 'install') {
    const state = await startImport({ reset: true });
    await syncBadge(state);
    await browser.tabs.create({ url: `${browser.runtime.getURL('/history.html')}?welcome=1` });
    return;
  }

  const state = await ensureImportStarted();
  await cleanupRecentSameDocumentVisits();
  await syncBadge(state);
}

async function handleStartup(): Promise<void> {
  await ensureAlarms();

  const state = await ensureImportStarted();
  await cleanupRecentSameDocumentVisits();
  await syncBadge(state);
}

async function handleAlarm(name: string): Promise<void> {
  if (name === IMPORT_ALARM) {
    const state = await runImportBatch();
    await syncBadge(state);
  }
}

function getNavigationState(tabId: number, frameId: number): NavigationState {
  const key = `${tabId}:${frameId}`;
  let state = navigationStates.get(key);
  if (!state) {
    state = {};
    navigationStates.set(key, state);
  }
  return state;
}

async function handleRedirectSource(source: RedirectSource): Promise<void> {
  await addRedirectMarker({ url: source.url, from: source.from, to: source.to });
  await deleteUrlVisitsBetween(source.url, source.from, source.to);

  // The intermediate page's onVisited handler can still be finishing when the
  // redirect target commits. Retry once so that late write is cleaned up too.
  await delay(1500);
  await deleteUrlVisitsBetween(source.url, source.from, source.to);
}

/**
 * A pushState/replaceState keeps the same document but Chrome still reports a
 * new history visit for each URL. Collapse the chain: drop the previous URL
 * and let the latest one represent the page.
 */
function handleSameDocumentNavigation(details: {
  tabId: number;
  frameId: number;
  url: string;
  timeStamp: number;
}): void {
  if (details.frameId !== 0) return;

  const state = getNavigationState(details.tabId, details.frameId);
  const previous = state.chainHead ?? state.committed;

  if (previous && previous.url !== details.url) {
    void suppressSupersededPage(previous).catch((error) => {
      console.error('History Vault: failed to drop same-document page', error);
    });
  }

  state.chainHead = { url: details.url, time: details.timeStamp };
}

async function suppressSupersededPage(page: NavigationSnapshot): Promise<void> {
  suppressedVisits = suppressVisit(suppressedVisits, page.url, page.time);

  // onVisited may land before or after this event, so run the cleanup twice.
  const from = page.time - 2000;
  const to = page.time + 3000;
  await deleteUrlVisitsBetween(page.url, from, to);
  await delay(1500);
  await deleteUrlVisitsBetween(page.url, from, to);
}

async function handleVisitRemoved(removed: {
  allHistory: boolean;
  urls?: string[];
}): Promise<void> {
  const settings = await getSettings();
  if (!settings.mirrorBrowserDeletes) return;

  if (removed.allHistory) {
    await clearVaultAndStopImport();
    return;
  }

  for (const url of removed.urls ?? []) {
    await deleteUrlFromVault(url);
  }
}

async function storeVisitedItem(item: Browser.history.HistoryItem): Promise<void> {
  if (!item.url) return;

  const visitedAt = item.lastVisitTime ?? 0;
  if (isSuppressedVisit(suppressedVisits, item.url, visitedAt)) return;

  await loadRedirectMarkers();

  if (isRedirectedVisit(getCachedRedirectMarkers(), item.url, visitedAt)) return;

  const result = await ingestHistoryItem(item);

  if (isSuppressedVisit(suppressedVisits, item.url, visitedAt)) {
    await deleteUrlVisitsBetween(item.url, visitedAt - 2000, visitedAt + 3000);
    return;
  }

  if (isRedirectedVisit(getCachedRedirectMarkers(), item.url, visitedAt)) {
    await deleteUrlVisitsBetween(item.url, visitedAt - 1000, visitedAt + 2000);
    return;
  }

  if (!result.page || result.page.title) return;

  // Chrome fires onVisited before the page title is available. Re-read the
  // item shortly after so the vault does not keep an empty title forever.
  await delay(1500);

  if (isSuppressedVisit(suppressedVisits, item.url, visitedAt)) return;
  if (isRedirectedVisit(getCachedRedirectMarkers(), item.url, visitedAt)) return;

  const candidates = await browser.history.search({
    text: item.url ?? '',
    startTime: item.lastVisitTime ? item.lastVisitTime - 60_000 : 0,
    maxResults: 10,
  });
  const fresh = candidates.find(
    (candidate) => candidate.url === item.url && candidate.title?.trim(),
  );
  if (!fresh) return;

  await ingestHistoryItem(fresh);

  const freshVisitTime = fresh.lastVisitTime ?? visitedAt;
  if (isSuppressedVisit(suppressedVisits, item.url, freshVisitTime)) {
    await deleteUrlVisitsBetween(item.url, freshVisitTime - 2000, freshVisitTime + 3000);
    return;
  }

  if (isRedirectedVisit(getCachedRedirectMarkers(), item.url, freshVisitTime)) {
    await deleteUrlVisitsBetween(item.url, freshVisitTime - 1000, freshVisitTime + 2000);
  }
}

async function clearVaultAndStopImport(): Promise<void> {
  await cancelImport();
  await waitForImportLockRelease();
  await clearVaultData();
  resetRedirectMarkersCache();
  await saveImportState({ ...defaultImportState(), phase: 'done' });
}

async function handleRequest(request: VaultRequest): Promise<{ ok: true }> {
  switch (request.type) {
    case 'delete-url': {
      const date = request.date ? parseDayKey(request.date) : null;
      await deleteUrlFromVault(request.url, date ?? undefined);
      return { ok: true };
    }
    case 'delete-day': {
      const date = parseDayKey(request.date);
      if (!date) throw new Error('日付の形式が不正です。');
      await deleteDayFromVault(date);
      return { ok: true };
    }
    case 'clear-vault': {
      await clearVaultAndStopImport();
      return { ok: true };
    }
    case 'start-import': {
      const state = await startImport({ reset: request.reset ?? true });
      await syncBadge(state);
      return { ok: true };
    }
  }

  throw new Error('不明なリクエストです。');
}

async function ensureAlarms(): Promise<void> {
  await browser.alarms.create(IMPORT_ALARM, { periodInMinutes: 1 });
}

async function cleanupRecentSameDocumentVisits(): Promise<void> {
  const end = Date.now();
  await removeSupersededSameDocumentVisits(end - RECENT_CLEANUP_MS, end);
}

async function syncBadge(state: ImportState): Promise<void> {
  if (state.phase !== 'running') {
    await browser.action.setBadgeText({ text: '' });
    return;
  }

  const progress =
    state.daysTotal > 0 ? Math.min(99, Math.round((state.daysDone / state.daysTotal) * 100)) : 0;
  await browser.action.setBadgeBackgroundColor({ color: '#ef3939' });
  await browser.action.setBadgeText({ text: progress > 0 ? `${progress}%` : '…' });
}

function isImportState(value: unknown): value is ImportState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { phase?: unknown }).phase === 'string'
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
