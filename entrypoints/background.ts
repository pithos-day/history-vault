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
import { clearVaultData, deleteDayFromVault, deleteUrlFromVault } from '@/utils/history/query';
import type { ImportState } from '@/utils/history/types';
import type { VaultRequest } from '@/utils/messages';
import { isVaultRequest } from '@/utils/messages';
import { ensureDefaultSettings, getSettings } from '@/utils/settings';

const IMPORT_ALARM = 'history-vault-import';

export default defineBackground(() => {
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
  await syncBadge(state);
}

async function handleStartup(): Promise<void> {
  await ensureAlarms();

  const state = await ensureImportStarted();
  await syncBadge(state);
}

async function handleAlarm(name: string): Promise<void> {
  if (name === IMPORT_ALARM) {
    const state = await runImportBatch();
    await syncBadge(state);
  }
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
  const result = await ingestHistoryItem(item);
  if (!result.page || result.page.title) return;

  // Chrome fires onVisited before the page title is available. Re-read the
  // item shortly after so the vault does not keep an empty title forever.
  await delay(1500);
  const candidates = await browser.history.search({
    text: item.url ?? '',
    startTime: item.lastVisitTime ? item.lastVisitTime - 60_000 : 0,
    maxResults: 10,
  });
  const fresh = candidates.find(
    (candidate) => candidate.url === item.url && candidate.title?.trim(),
  );
  if (fresh) await ingestHistoryItem(fresh);
}

async function clearVaultAndStopImport(): Promise<void> {
  await cancelImport();
  await waitForImportLockRelease();
  await clearVaultData();
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
