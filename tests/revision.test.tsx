import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { useDebouncedVaultRevision } from '../entrypoints/history/hooks/useDebouncedVaultRevision';
import { bumpVaultRevision, getVaultRevision, type VaultRevision } from '../utils/vault-events';

function revision(seq: number, days: string[] = [], reset = false): VaultRevision {
  return { seq, days, reset };
}

describe('vault revision', () => {
  beforeEach(async () => {
    await fakeBrowser.storage.local.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores the changed days with a monotonically increasing sequence', async () => {
    await bumpVaultRevision({ days: ['2026-10-01', '2026-10-01', ''] });
    const first = await getVaultRevision();
    expect(first.days).toEqual(['2026-10-01']);
    expect(first.reset).toBe(false);

    await bumpVaultRevision({ days: ['2026-10-02'], reset: true });
    const second = await getVaultRevision();
    expect(second.seq).toBeGreaterThan(first.seq);
    expect(second).toEqual(revision(second.seq, ['2026-10-02'], true));
  });

  it('reads legacy numeric revisions as a full refresh', async () => {
    await fakeBrowser.storage.local.set({ vaultRevision: 42 });

    expect(await getVaultRevision()).toEqual(revision(42));
  });
});

describe('useDebouncedVaultRevision', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('merges days from rapid revisions instead of dropping the earlier ones', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }: { value: VaultRevision }) => useDebouncedVaultRevision(value, 400),
      { initialProps: { value: revision(0) } },
    );

    rerender({ value: revision(1, ['2026-10-01']) });
    rerender({ value: revision(2, ['2026-10-02', '2026-10-03']) });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current).toEqual(revision(2, ['2026-10-01', '2026-10-02', '2026-10-03']));
  });

  it('ignores revisions older than the pending one', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }: { value: VaultRevision }) => useDebouncedVaultRevision(value, 400),
      { initialProps: { value: revision(0) } },
    );

    rerender({ value: revision(5, ['2026-10-05']) });
    rerender({ value: revision(4, ['2026-10-04']) });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current).toEqual(revision(5, ['2026-10-05']));
  });

  it('keeps the reset flag when a reset is followed by another change', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }: { value: VaultRevision }) => useDebouncedVaultRevision(value, 400),
      { initialProps: { value: revision(0) } },
    );

    rerender({ value: revision(1, [], true) });
    rerender({ value: revision(2, ['2026-10-06']) });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current).toEqual(revision(2, ['2026-10-06'], true));
  });

  it('does not emit the initial empty revision', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDebouncedVaultRevision(revision(0), 400));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toEqual(revision(0));
  });
});
