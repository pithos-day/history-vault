import { useEffect, useState } from 'react';
import { getVaultRevision, subscribeVaultRevision } from '@/utils/vault-events';

export function useVaultRevision(): number {
  const [revision, setRevision] = useState(0);

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
