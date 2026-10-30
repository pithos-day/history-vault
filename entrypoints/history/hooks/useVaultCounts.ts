import { useEffect, useState } from 'react';
import { getVaultCounts } from '@/utils/history/query';

export function useVaultCounts(revision: number): { pages: number; visits: number } {
  const [counts, setCounts] = useState({ pages: 0, visits: 0 });

  useEffect(() => {
    let active = true;
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
