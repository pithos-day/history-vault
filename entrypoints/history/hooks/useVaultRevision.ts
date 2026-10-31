import { useEffect, useState } from 'react';
import { getVaultRevision, subscribeVaultRevision, type VaultRevision } from '@/utils/vault-events';

const emptyRevision: VaultRevision = { seq: 0, days: [], reset: false };

export function useVaultRevision(): VaultRevision {
  const [revision, setRevision] = useState<VaultRevision>(emptyRevision);

  useEffect(() => {
    let active = true;
    void getVaultRevision().then((value) => {
      if (active) setRevision(value);
    });
    const unsubscribe = subscribeVaultRevision(setRevision);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return revision;
}
