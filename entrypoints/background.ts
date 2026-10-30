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
} from '@/utils/history/import';
import { clearVaultData, deleteDayFromVault, deleteUrlFromVault } from '@/utils/history/query';
import { reconcileRecent } from '@/utils/history/reconcile';
import type { ImportState } from '@/utils/history/types';
import type { VaultRequest } from '@/utils/messages';
import { isVaultRequest } from '@/utils/messages';
import { ensureDefaultSettings, getSettings } from '@/utils/settings';

const IMPORT_ALARM = 'history-vault-import';
const RECONCILE_ALARM = 'history-vault-reconcile';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    void handleInstalled(reason);
  });

  browser.runtime.onStartup.addListener(() => {
    void handleStartup();
  });

  browser.history.onVisited.addListener((item) => {
    void ingestHistoryItem(item).catch((error) => {
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

  void reconcileRecent(7).catch((error) => {
    console.error('History Vault: startup reconcile failed', error);
  });
}

async function handleAlarm(name: string): Promise<void> {
  if (name === IMPORT_ALARM) {
    const state = await runImportBatch();
    await syncBadge(state);
    return;
  }

  if (name === RECONCILE_ALARM) {
    await reconcileRecent(2);
  }
}

async function handleVisitRemoved(removed: {
  allHistory: boolean;
  urls?: string[];
}): Promise<void> {
  const settings = await getSettings();
  if (!settings.mirrorBrowserDeletes) return;

  if (removed.allHistory) {
    await clearVaultData();
    await saveImportState({ ...defaultImportState(), phase: 'done' });
    return;
  }

  for (const url of removed.urls ?? []) {
    await deleteUrlFromVault(url);
  }
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
      await cancelImport();
      await clearVaultData();
      await saveImportState({ ...defaultImportState(), phase: 'done' });
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
  await browser.alarms.create(RECONCILE_ALARM, { periodInMinutes: 30 });
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
