import type { Browser } from 'wxt/browser';
import { browser } from 'wxt/browser';
import { delay } from '../delay';
import { ingestHistoryItem } from './collect';
import { deleteUrlVisitsInInclusiveWindow } from './query';
import {
  addRedirectMarker,
  getCachedRedirectMarkers,
  isRedirectedVisit,
  loadRedirectMarkers,
  type NavigationSnapshot,
  type RedirectSource,
} from './redirects';
import { isSuppressedVisit, type SuppressedVisit, suppressVisit } from './same-document';
import { REDIRECT_WINDOW, SAME_DOCUMENT_WINDOW, windowAround } from './visit-windows';

interface NavigationState {
  before?: NavigationSnapshot;
  committed?: NavigationSnapshot;
  /** The latest URL in a same-document navigation chain for this tab. */
  chainHead?: NavigationSnapshot;
}

const navigationStates = new Map<string, NavigationState>();
let suppressedVisits: SuppressedVisit[] = [];

export function getNavigationState(tabId: number, frameId: number): NavigationState {
  const key = `${tabId}:${frameId}`;
  let state = navigationStates.get(key);
  if (!state) {
    state = {};
    navigationStates.set(key, state);
  }
  return state;
}

export function resetLiveState(): void {
  navigationStates.clear();
  suppressedVisits = [];
}

export function forgetTabNavigationState(tabId: number): void {
  const prefix = `${tabId}:`;
  for (const key of navigationStates.keys()) {
    if (key.startsWith(prefix)) navigationStates.delete(key);
  }
}

/**
 * A pushState/replaceState keeps the same document but Chrome still reports a
 * new history visit for each URL. Collapse the chain: drop the previous URL
 * and let the latest one represent the page.
 */
export function handleSameDocumentNavigation(details: {
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

export async function handleRedirectSource(source: RedirectSource): Promise<void> {
  await addRedirectMarker({ url: source.url, from: source.from, to: source.to });
  await deleteUrlVisitsInInclusiveWindow(source.url, source.from, source.to);

  // The intermediate page's onVisited handler can still be finishing when the
  // redirect target commits. Retry once so that late write is cleaned up too.
  await delay(1500);
  await deleteUrlVisitsInInclusiveWindow(source.url, source.from, source.to);
}

export async function storeVisitedItem(item: Browser.history.HistoryItem): Promise<void> {
  if (!item.url) return;

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

async function suppressSupersededPage(page: NavigationSnapshot): Promise<void> {
  suppressedVisits = suppressVisit(suppressedVisits, page.url, page.time);

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
