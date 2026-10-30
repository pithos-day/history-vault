import { useEffect, useState } from 'react';
import type { Browser } from 'wxt/browser';
import { browser } from 'wxt/browser';
import {
  defaultImportState,
  getImportState,
  IMPORT_STATE_KEY,
  isImportState,
} from '@/utils/history/import';
import type { ImportState } from '@/utils/history/types';

export function useImportState(): ImportState {
  const [state, setState] = useState<ImportState>(() => defaultImportState());

  useEffect(() => {
    let active = true;
    void getImportState().then((value) => {
      if (active) setState(value);
    });

    const handler = (changes: Record<string, Browser.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      const change = changes[IMPORT_STATE_KEY];
      if (change && isImportState(change.newValue)) setState(change.newValue);
    };

    browser.storage.onChanged.addListener(handler);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(handler);
    };
  }, []);

  return state;
}
