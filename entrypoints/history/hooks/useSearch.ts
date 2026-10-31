/* eslint-disable react-hooks/set-state-in-effect -- data fetching hooks reset loading state when inputs change. */
import { useEffect, useState } from 'react';
import { searchPages } from '@/utils/history/search';
import type { SearchResult } from '@/utils/history/types';
import type { VaultRevision } from '@/utils/vault-events';

export function useSearch(
  query: string,
  revision: VaultRevision,
): { results: SearchResult[]; loading: boolean } {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    void revision;

    const timer = setTimeout(() => {
      void searchPages(trimmed)
        .then((value) => {
          if (!active) return;
          setResults(value);
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setResults([]);
          setLoading(false);
        });
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, revision]);

  return { results, loading };
}
