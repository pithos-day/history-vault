import { useEffect, useState } from 'react';
import { getVaultCounts } from '@/utils/history/query';
import type { VaultRevision } from '@/utils/vault-events';

export function useVaultCounts(revision: VaultRevision): { pages: number; visits: number } {
  const [counts, setCounts] = useState({ pages: 0, visits: 0 });

  useEffect(() => {
    let active = true;
    // Counts change with every vault revision; the value is only a trigger.
    void revision;
    void getVaultCounts().then((value) => {
      if (active) setCounts(value);
    });
    return () => {
      active = false;
    };
  }, [revision]);

  return counts;
}
