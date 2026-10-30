import { db } from '../db';

export const VAULT_EPOCH_KEY = 'vaultEpoch';

/**
 * Monotonic generation of the vault contents. A clear increments it so
 * in-flight imports can detect that their work belongs to a deleted vault.
 */
export async function getVaultEpoch(): Promise<number> {
  const record = await db.meta.get(VAULT_EPOCH_KEY);
  return typeof record?.value === 'number' ? record.value : 0;
}

export async function bumpVaultEpoch(): Promise<number> {
  return db.transaction('rw', db.meta, async () => {
    const next = (await getVaultEpoch()) + 1;
    await db.meta.put({ key: VAULT_EPOCH_KEY, value: next });
    return next;
  });
}
