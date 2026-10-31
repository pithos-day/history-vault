import type { Browser } from 'wxt/browser';
import { browser } from 'wxt/browser';

const VAULT_REVISION_KEY = 'vaultRevision';

export interface VaultRevision {
  seq: number;
  days: string[];
  reset: boolean;
}

export interface VaultRevisionOptions {
  days?: Iterable<string>;
  reset?: boolean;
}

const EMPTY_REVISION: VaultRevision = { seq: 0, days: [], reset: false };
let lastSequence = 0;

function nextSequence(): number {
  lastSequence = Math.max(Date.now(), lastSequence + 1);
  return lastSequence;
}

export async function bumpVaultRevision(options: VaultRevisionOptions = {}): Promise<void> {
  const revision: VaultRevision = {
    seq: nextSequence(),
    days: [...new Set(options.days ?? [])].filter(Boolean),
    reset: options.reset ?? false,
  };
  await browser.storage.local.set({ [VAULT_REVISION_KEY]: revision });
}

export async function getVaultRevision(): Promise<VaultRevision> {
  const result = await browser.storage.local.get(VAULT_REVISION_KEY);
  return normalizeVaultRevision(result[VAULT_REVISION_KEY]);
}

export function subscribeVaultRevision(listener: (revision: VaultRevision) => void): () => void {
  const handler = (changes: Record<string, Browser.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local') return;
    const change = changes[VAULT_REVISION_KEY];
    const revision = normalizeVaultRevision(change?.newValue);
    if (revision.seq > 0) listener(revision);
  };

  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

function normalizeVaultRevision(value: unknown): VaultRevision {
  if (typeof value === 'number') {
    return { seq: value, days: [], reset: false };
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Partial<VaultRevision>;
    if (typeof record.seq === 'number') {
      return {
        seq: record.seq,
        days: Array.isArray(record.days)
          ? record.days.filter((day): day is string => typeof day === 'string')
          : [],
        reset: record.reset === true,
      };
    }
  }

  return EMPTY_REVISION;
}
