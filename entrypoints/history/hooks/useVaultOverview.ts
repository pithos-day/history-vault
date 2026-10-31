import { useEffect, useState } from 'react';
import { getVaultOverview, type VaultOverview } from '@/utils/history/query';

const emptyOverview: VaultOverview = { bounds: null, activity: new Map() };

export function useVaultOverview(revision: number): VaultOverview {
  const [overview, setOverview] = useState<VaultOverview>(emptyOverview);

  useEffect(() => {
    let active = true;
    void revision;
    void getVaultOverview().then((value) => {
      if (active) setOverview(value);
    });

    return () => {
      active = false;
    };
  }, [revision]);

  return overview;
}
