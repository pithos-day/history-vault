export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatPercent(value: number, total: number): string {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

export const STORAGE_WARNING_RATIO = 0.8;

export function getStorageUsageRatio(usage: number, quota: number): number {
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) return 0;
  return Math.max(0, Math.min(1, usage / quota));
}

export function isStorageUsageHigh(usage: number, quota: number): boolean {
  return getStorageUsageRatio(usage, quota) >= STORAGE_WARNING_RATIO;
}
