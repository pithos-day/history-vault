import { useEffect, useRef } from 'react';
import { runImportBatch } from '@/utils/history/import';
import type { ImportState } from '@/utils/history/types';

export function useImportRunner(state: ImportState): void {
  const runningRef = useRef(false);

  useEffect(() => {
    if (state.phase !== 'running') return;

    let cancelled = false;

    const run = async () => {
      if (runningRef.current || document.visibilityState !== 'visible') return;
      runningRef.current = true;

      try {
        while (!cancelled && document.visibilityState === 'visible') {
          const next = await runImportBatch();
          if (next.phase !== 'running') break;
          await delay(400);
        }
      } finally {
        runningRef.current = false;
      }
    };

    void run();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void run();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [state.phase]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
