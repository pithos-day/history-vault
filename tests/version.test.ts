import { describe, expect, it } from 'vitest';
import { formatVersion } from '../utils/version';

describe('formatVersion', () => {
  it('prefixes a bare version', () => {
    expect(formatVersion('0.1.0')).toBe('v0.1.0');
  });

  it('keeps an existing prefix', () => {
    expect(formatVersion('v0.1.0')).toBe('v0.1.0');
  });
});
