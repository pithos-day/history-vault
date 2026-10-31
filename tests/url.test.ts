import { describe, expect, it } from 'vitest';
import { categorizeTransition, emptyTransitionCounts } from '../utils/history/transitions';
import {
  getDisplayUrl,
  getHost,
  getHostInitial,
  getHostUrl,
  isLocalFileHost,
  isSupportedUrl,
  LOCAL_FILE_HOST,
} from '../utils/url';

describe('url helpers', () => {
  it('allows only web and local file URLs', () => {
    expect(isSupportedUrl('https://example.com')).toBe(true);
    expect(isSupportedUrl('http://localhost:3000')).toBe(true);
    expect(isSupportedUrl('file:///tmp/page.html')).toBe(true);
    expect(isSupportedUrl('chrome://history')).toBe(false);
    expect(isSupportedUrl('javascript:alert(1)')).toBe(false);
    expect(isSupportedUrl(undefined)).toBe(false);
  });

  it('extracts hosts and display URLs', () => {
    expect(getHost('https://www.example.com/path')).toBe('www.example.com');
    expect(getHost('file:///tmp/page.html')).toBe(LOCAL_FILE_HOST);
    expect(isLocalFileHost(LOCAL_FILE_HOST)).toBe(true);
    expect(isLocalFileHost('example.com')).toBe(false);
    expect(getDisplayUrl('https://example.com/')).toBe('example.com');
    expect(getDisplayUrl('https://example.com/a?b=1')).toBe('example.com/a?b=1');
  });

  it('creates favicon fallback initials', () => {
    expect(getHostInitial('www.example.com')).toBe('E');
    expect(getHostInitial(LOCAL_FILE_HOST)).toBe('F');
  });

  it('does not build a favicon URL for local files', () => {
    expect(getHostUrl('example.com')).toBe('https://example.com/');
    expect(getHostUrl(LOCAL_FILE_HOST)).toBe('');
  });
});

describe('transition mapping', () => {
  it('maps Chrome transition types to Vivaldi-style categories', () => {
    expect(categorizeTransition('typed')).toBe('typed');
    expect(categorizeTransition('link')).toBe('link');
    expect(categorizeTransition('reload')).toBe('reload');
    expect(categorizeTransition('form_submit')).toBe('form');
    expect(categorizeTransition('generated')).toBe('direct');
    expect(categorizeTransition('auto_bookmark')).toBe('other');
  });

  it('starts with zeroed counts', () => {
    expect(Object.values(emptyTransitionCounts()).every((value) => value === 0)).toBe(true);
  });
});
