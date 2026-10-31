import { browser } from 'wxt/browser';

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

/**
 * Display host stored for file:// pages. This value is persisted in page and
 * visit records, so changing it would require a data migration.
 */
export const LOCAL_FILE_HOST = 'ローカルファイル';

export function isLocalFileHost(host: string): boolean {
  return host === LOCAL_FILE_HOST;
}

export function isSupportedUrl(value: string | undefined): value is string {
  if (!value) return false;

  try {
    return SUPPORTED_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function getHost(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return LOCAL_FILE_HOST;
    return parsed.host || parsed.hostname || '';
  } catch {
    return '';
  }
}

export function getHostInitial(host: string): string {
  if (isLocalFileHost(host)) return 'F';

  const label = host.replace(/^www\./, '');
  return (label[0] ?? '?').toUpperCase();
}

export function getFaviconUrl(url: string, size = 32): string | null {
  if (!isSupportedUrl(url) || url.startsWith('file:')) return null;

  try {
    const favicon = new URL(browser.runtime.getURL('/_favicon/' as never));
    favicon.searchParams.set('pageUrl', url);
    favicon.searchParams.set('size', String(size));
    return favicon.toString();
  } catch {
    return null;
  }
}

export function getHostUrl(host: string): string {
  if (isLocalFileHost(host)) return '';
  return host.startsWith('http://') || host.startsWith('https://') ? host : `https://${host}/`;
}

export function getDisplayUrl(value: string): string {
  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path === '/' ? url.host : `${url.host}${path}`;
  } catch {
    return value;
  }
}
