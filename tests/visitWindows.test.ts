import { describe, expect, it } from 'vitest';
import {
  REDIRECT_WINDOW,
  SAME_DOCUMENT_WINDOW,
  windowAround,
  windowAroundSpan,
} from '../utils/history/visit-windows';

describe('visit windows', () => {
  it('builds a same-document window around a visit', () => {
    expect(windowAround(10_000, SAME_DOCUMENT_WINDOW)).toEqual({ from: 8_000, to: 13_000 });
  });

  it('builds a redirect window spanning two times in either order', () => {
    expect(windowAroundSpan(10_000, 12_000, REDIRECT_WINDOW)).toEqual({
      from: 9_000,
      to: 14_000,
    });
    expect(windowAroundSpan(12_000, 10_000, REDIRECT_WINDOW)).toEqual({
      from: 9_000,
      to: 14_000,
    });
  });
});
