import { browser } from 'wxt/browser';

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

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
    if (parsed.protocol === 'file:') return 'ローカルファイル';
    return parsed.host || parsed.hostname || '';
  } catch {
    return '';
  }
}

export function getHostInitial(host: string): string {
  const label = host.replace(/^www\./, '').replace(/^ローカルファイル$/, 'FILE');
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
