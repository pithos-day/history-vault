import type { Browser } from 'wxt/browser';
import { browser } from 'wxt/browser';

export const VAULT_REVISION_KEY = 'vaultRevision';

export async function bumpVaultRevision(): Promise<void> {
  await browser.storage.local.set({ [VAULT_REVISION_KEY]: Date.now() });
}

export async function getVaultRevision(): Promise<number> {
  const result = await browser.storage.local.get(VAULT_REVISION_KEY);
  const value = result[VAULT_REVISION_KEY];
  return typeof value === 'number' ? value : 0;
}

export function subscribeVaultRevision(listener: (revision: number) => void): () => void {
  const handler = (changes: Record<string, Browser.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local') return;
    const change = changes[VAULT_REVISION_KEY];
    if (typeof change?.newValue === 'number') listener(change.newValue);
  };

  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
