import type { Browser } from 'wxt/browser';
import { browser } from 'wxt/browser';
import { delay } from '../delay';
import { ingestHistoryItem } from './collect';
import { deleteUrlVisitsInInclusiveWindow, removeInferredRedirectVisits } from './query';
import {
  addRedirectMarker,
  findRedirectSource,
  getCachedRedirectMarkers,
  isRedirectedVisit,
  loadRedirectMarkers,
  type NavigationSnapshot,
  type RedirectSource,
} from './redirects';
import {
  isSuppressedVisit,
  pruneSuppressedVisits,
  type SuppressedVisit,
  suppressVisit,
} from './same-document';
import { REDIRECT_WINDOW, SAME_DOCUMENT_WINDOW, windowAround } from './visit-windows';

interface NavigationState {
  before?: NavigationSnapshot;
  committed?: NavigationSnapshot;
  /** The latest URL in a same-document navigation chain for this tab. */
  chainHead?: NavigationSnapshot;
}

interface NavigationDetails {
  tabId: number;
  frameId: number;
  url: string;
  timeStamp: number;
  transitionQualifiers?: string[];
}

interface PersistedLiveState {
  navigationStates: Record<string, NavigationState>;
  suppressedVisits: SuppressedVisit[];
}

export const LIVE_STATE_KEY = 'liveNavigationState';

const navigationStates = new Map<string, NavigationState>();
let suppressedVisits: SuppressedVisit[] = [];
let loadPromise: Promise<void> | null = null;
let saveQueue: Promise<void> = Promise.resolve();

export function getNavigationState(tabId: number, frameId: number): NavigationState {
  const key = `${tabId}:${frameId}`;
  let state = navigationStates.get(key);
  if (!state) {
    state = {};
    navigationStates.set(key, state);
  }
  return state;
}

/**
 * MV3 service workers can stop at any time, so navigation state is also kept
 * in session storage. It only needs to survive the worker, not the browser.
 */
export function loadLiveState(): Promise<void> {
  loadPromise ??= readLiveState().catch((error: unknown) => {
    console.error('History Vault: failed to load live navigation state', error);
  });
  return loadPromise;
}

function saveLiveState(): Promise<void> {
  const snapshot: PersistedLiveState = {
    navigationStates: Object.fromEntries(
      [...navigationStates].map(([key, state]) => [key, cloneNavigationState(state)]),
    ),
    suppressedVisits: suppressedVisits.map((marker) => ({ ...marker })),
  };

  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => browser.storage.session.set({ [LIVE_STATE_KEY]: snapshot }))
    .catch((error: unknown) => {
      console.error('History Vault: failed to save live navigation state', error);
    });

  return saveQueue;
}

export async function resetLiveState(): Promise<void> {
  await saveQueue;
  navigationStates.clear();
  suppressedVisits = [];
  loadPromise = null;
}

export async function forgetTabNavigationState(tabId: number): Promise<void> {
  await loadLiveState();
  const prefix = `${tabId}:`;
  for (const key of navigationStates.keys()) {
    if (key.startsWith(prefix)) navigationStates.delete(key);
  }
  await saveLiveState();
}

export async function recordNavigationStart(details: NavigationDetails): Promise<void> {
  await loadLiveState();
  const state = getNavigationState(details.tabId, details.frameId);
  state.before = { url: details.url, time: details.timeStamp };
  await saveLiveState();
}

export async function recordNavigationCommit(
  details: NavigationDetails,
): Promise<RedirectSource | null> {
  await loadLiveState();
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
  await saveLiveState();

  return source;
}

/**
 * A pushState/replaceState keeps the same document but Chrome still reports a
 * new history visit for each URL. Collapse the chain: drop the previous URL
 * and let the latest one represent the page.
 */
export async function handleSameDocumentNavigation(details: NavigationDetails): Promise<void> {
  if (details.frameId !== 0) return;

  await loadLiveState();
  const state = getNavigationState(details.tabId, details.frameId);
  const previous = state.chainHead ?? state.committed;

  if (previous && previous.url !== details.url) {
    suppressedVisits = suppressVisit(suppressedVisits, previous.url, previous.time);
    void dropSupersededPage(previous).catch((error) => {
      console.error('History Vault: failed to drop same-document page', error);
    });
  }

  state.chainHead = { url: details.url, time: details.timeStamp };
  await saveLiveState();
}

export async function handleRedirectSource(source: RedirectSource): Promise<void> {
  await addRedirectMarker({ url: source.url, from: source.from, to: source.to });
  await deleteUrlVisitsInInclusiveWindow(source.url, source.from, source.to);

  // The intermediate pages' onVisited handlers can still be finishing when the
  // redirect target commits. Rebuild the chain from visit metadata once every
  // hop has landed so all of them, not just the first, are removed.
  await delay(1500);
  await removeInferredRedirectVisits(source.from, source.to);
  await deleteUrlVisitsInInclusiveWindow(source.url, source.from, source.to);
}

export async function storeVisitedItem(item: Browser.history.HistoryItem): Promise<void> {
  if (!item.url) return;

  await loadLiveState();

  const visitedAt = item.lastVisitTime ?? 0;
  if (isSuppressedVisit(suppressedVisits, item.url, visitedAt)) return;

  await loadRedirectMarkers();

  if (isRedirectedVisit(getCachedRedirectMarkers(), item.url, visitedAt)) return;

  const result = await ingestHistoryItem(item);

  if (isSuppressedVisit(suppressedVisits, item.url, visitedAt)) {
    await deleteSameDocumentWindow(item.url, visitedAt);
    return;
  }

  if (isRedirectedVisit(getCachedRedirectMarkers(), item.url, visitedAt)) {
    await deleteRedirectWindow(item.url, visitedAt);
    return;
  }

  if (!result.page || result.page.title) return;

  // Chrome fires onVisited before the page title is available. Re-read the
  // item shortly after so the vault does not keep an empty title forever.
  await delay(1500);

  if (isSuppressedVisit(suppressedVisits, item.url, visitedAt)) {
    await deleteSameDocumentWindow(item.url, visitedAt);
    return;
  }

  if (isRedirectedVisit(getCachedRedirectMarkers(), item.url, visitedAt)) {
    await deleteRedirectWindow(item.url, visitedAt);
    return;
  }

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
    await deleteSameDocumentWindow(item.url, freshVisitTime);
    return;
  }

  if (isRedirectedVisit(getCachedRedirectMarkers(), item.url, freshVisitTime)) {
    await deleteRedirectWindow(item.url, freshVisitTime);
  }
}

async function readLiveState(): Promise<void> {
  const stored = await browser.storage.session.get(LIVE_STATE_KEY);
  const value: unknown = stored[LIVE_STATE_KEY];
  if (!isRecord(value)) return;

  if (isRecord(value.navigationStates)) {
    for (const [key, state] of Object.entries(value.navigationStates)) {
      if (isNavigationState(state) && !navigationStates.has(key)) {
        navigationStates.set(key, state);
      }
    }
  }

  if (Array.isArray(value.suppressedVisits)) {
    suppressedVisits = pruneSuppressedVisits(
      value.suppressedVisits.filter(isSuppressedVisitMarker),
    );
  }
}

function cloneNavigationState(state: NavigationState): NavigationState {
  return {
    before: state.before ? { ...state.before } : undefined,
    committed: state.committed ? { ...state.committed } : undefined,
    chainHead: state.chainHead ? { ...state.chainHead } : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNavigationSnapshot(value: unknown): value is NavigationSnapshot {
  return isRecord(value) && typeof value.url === 'string' && typeof value.time === 'number';
}

function isNavigationState(value: unknown): value is NavigationState {
  if (!isRecord(value)) return false;
  return [value.before, value.committed, value.chainHead].every(
    (snapshot) => snapshot === undefined || isNavigationSnapshot(snapshot),
  );
}

function isSuppressedVisitMarker(value: unknown): value is SuppressedVisit {
  return (
    isRecord(value) &&
    typeof value.url === 'string' &&
    typeof value.from === 'number' &&
    typeof value.to === 'number'
  );
}

async function dropSupersededPage(page: NavigationSnapshot): Promise<void> {
  // onVisited may land before or after this event, so run the cleanup twice.
  await deleteSameDocumentWindow(page.url, page.time);
  await delay(1500);
  await deleteSameDocumentWindow(page.url, page.time);
}

async function deleteSameDocumentWindow(url: string, time: number): Promise<void> {
  const { from, to } = windowAround(time, SAME_DOCUMENT_WINDOW);
  await deleteUrlVisitsInInclusiveWindow(url, from, to);
}

async function deleteRedirectWindow(url: string, time: number): Promise<void> {
  const { from, to } = windowAround(time, REDIRECT_WINDOW);
  await deleteUrlVisitsInInclusiveWindow(url, from, to);
}
