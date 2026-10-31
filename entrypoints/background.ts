import { browser } from 'wxt/browser';
import { parseDayKey } from '@/utils/date';
import {
  cancelImport,
  defaultImportState,
  ensureImportStarted,
  IMPORT_STATE_KEY,
  isImportState,
  runImportBatch,
  saveImportState,
  startImport,
  waitForImportLockRelease,
} from '@/utils/history/import';
import {
  forgetTabNavigationState,
  getNavigationState,
  handleRedirectSource,
  handleSameDocumentNavigation,
  storeVisitedItem,
} from '@/utils/history/live';
import {
  cleanupHistoryRange,
  clearVaultData,
  deleteDayFromVault,
  deleteUrlFromVault,
} from '@/utils/history/query';
import {
  findRedirectSource,
  loadRedirectMarkers,
  resetRedirectMarkersCache,
} from '@/utils/history/redirects';
import { RECENT_CLEANUP_MS } from '@/utils/history/same-document';
import type { ImportState } from '@/utils/history/types';
import type { VaultRequest } from '@/utils/messages';
import { isVaultRequest } from '@/utils/messages';
import { ensureDefaultSettings, getSettings } from '@/utils/settings';

const IMPORT_ALARM = 'history-vault-import';
const CLEANUP_ALARM = 'history-vault-cleanup';

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
    forgetTabNavigationState(tabId);
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
    return;
  }

  if (name === CLEANUP_ALARM) {
    await cleanupRecentVisits();
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
  await browser.alarms.create(CLEANUP_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: 360,
  });
}

async function cleanupRecentVisits(): Promise<void> {
  const end = Date.now();
  await cleanupHistoryRange(end - RECENT_CLEANUP_MS, end);
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
