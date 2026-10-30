import { describe, expect, it } from 'vitest';
import { categorizeTransition, emptyTransitionCounts } from '../utils/history/transitions';
import { getDisplayUrl, getHost, getHostInitial, isSupportedUrl } from '../utils/url';

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
    expect(getHost('file:///tmp/page.html')).toBe('ローカルファイル');
    expect(getDisplayUrl('https://example.com/')).toBe('example.com');
    expect(getDisplayUrl('https://example.com/a?b=1')).toBe('example.com/a?b=1');
  });

  it('creates favicon fallback initials', () => {
    expect(getHostInitial('www.example.com')).toBe('E');
    expect(getHostInitial('ローカルファイル')).toBe('F');
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
