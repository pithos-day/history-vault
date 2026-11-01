/* eslint-disable react-hooks/set-state-in-effect -- data fetching hooks reset loading state when inputs change. */
import { useEffect, useState } from 'react';
import { searchPages } from '@/utils/history/search';
import type { SearchResult } from '@/utils/history/types';
import type { VaultRevision } from '@/utils/vault-events';

export function useSearch(
  query: string,
  revision: VaultRevision,
): { results: SearchResult[]; loading: boolean; total: number; truncated: boolean } {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setTotal(0);
      setTruncated(false);
      return;
    }

    let active = true;
    setLoading(true);
    // Search results can change after any vault edit, so re-run on revision
    // changes even though the query does not read the revision itself.
    void revision;

    const timer = setTimeout(() => {
      void searchPages(trimmed)
        .then((value) => {
          if (!active) return;
          setResults(value.results);
          setTotal(value.total);
          setTruncated(value.truncated);
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setResults([]);
          setTotal(0);
          setTruncated(false);
          setLoading(false);
        });
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, revision]);

  return { results, loading, total, truncated };
}
