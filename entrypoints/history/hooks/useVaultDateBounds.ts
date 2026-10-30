import { useEffect, useState } from 'react';
import { getVaultDateBounds } from '@/utils/history/query';

export interface VaultDateBounds {
  earliest: number;
  latest: number;
}

export function useVaultDateBounds(revision: number): VaultDateBounds | null {
  const [bounds, setBounds] = useState<VaultDateBounds | null>(null);

  useEffect(() => {
    let active = true;
    void revision;
    void getVaultDateBounds().then((value) => {
      if (active) setBounds(value);
    });

    return () => {
      active = false;
    };
  }, [revision]);

  return bounds;
}
