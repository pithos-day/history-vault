import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatPercent,
  getStorageUsageRatio,
  isStorageUsageHigh,
  STORAGE_WARNING_RATIO,
} from '../utils/format';

describe('format', () => {
  it('formats byte counts with readable units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
  });

  it('formats percentages and handles an empty total', () => {
    expect(formatPercent(1, 4)).toBe('25%');
    expect(formatPercent(3, 0)).toBe('0%');
  });

  it('warns once usage reaches the configured share of the quota', () => {
    expect(getStorageUsageRatio(50, 100)).toBe(0.5);
    expect(getStorageUsageRatio(STORAGE_WARNING_RATIO * 100, 100)).toBe(STORAGE_WARNING_RATIO);
    expect(isStorageUsageHigh(STORAGE_WARNING_RATIO * 100, 100)).toBe(true);
    expect(isStorageUsageHigh(79, 100)).toBe(false);
  });

  it('treats missing or invalid estimates as empty', () => {
    expect(getStorageUsageRatio(Number.NaN, 100)).toBe(0);
    expect(getStorageUsageRatio(10, 0)).toBe(0);
    expect(isStorageUsageHigh(10, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
