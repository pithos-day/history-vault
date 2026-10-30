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
