import { useCallback, useEffect, useRef, useState } from 'react';
import { parseDayKey } from '@/utils/date';
import {
  getCalendarActivityForDates,
  getVaultOverview,
  type VaultOverview,
} from '@/utils/history/query';
import type { VaultRevision } from '@/utils/vault-events';

const emptyOverview: VaultOverview = { bounds: null, activity: new Map() };

export function useVaultOverview(revision: VaultRevision): VaultOverview {
  const [overview, setOverview] = useState<VaultOverview>(emptyOverview);
  const overviewRef = useRef(emptyOverview);
  const loadedRef = useRef(false);

  const commit = useCallback((next: VaultOverview) => {
    overviewRef.current = next;
    setOverview(next);
  }, []);

  useEffect(() => {
    let active = true;
    const current = overviewRef.current;

    // A reset, an unknown changed day, an empty calendar, or a revision that
    // arrives before the first snapshot has to read the whole summary table.
    if (
      revision.reset ||
      revision.days.length === 0 ||
      !loadedRef.current ||
      current.activity.size === 0
    ) {
      void getVaultOverview().then((value) => {
        if (!active) return;
        loadedRef.current = true;
        commit(value);
      });

      return () => {
        active = false;
      };
    }

    const dates = revision.days;
    void getCalendarActivityForDates(dates).then((changed) => {
      if (!active) return;

      const base = overviewRef.current;
      const activity = new Map(base.activity);
      for (const date of dates) {
        const day = changed.get(date);
        if (day) activity.set(date, day);
        else activity.delete(date);
      }

      commit({ bounds: getBounds(activity), activity });
    });

    return () => {
      active = false;
    };
  }, [revision, commit]);

  return overview;
}

/**
 * Day keys are zero-padded ISO dates, so string comparison gives the same
 * order as timestamps without constructing a Date per calendar row.
 */
function getBounds(activity: Map<string, { views: number; pages: number }>): {
  earliest: number;
  latest: number;
} | null {
  let earliest = '';
  let latest = '';

  for (const date of activity.keys()) {
    if (!earliest || date < earliest) earliest = date;
    if (!latest || date > latest) latest = date;
  }

  const earliestTime = parseDayKey(earliest)?.getTime();
  const latestTime = parseDayKey(latest)?.getTime();
  if (earliestTime === undefined || latestTime === undefined) return null;
  return { earliest: earliestTime, latest: latestTime };
}
