export interface VisitWindow {
  readonly beforeMs: number;
  readonly afterMs: number;
}

export const SAME_DOCUMENT_WINDOW = {
  beforeMs: 2_000,
  afterMs: 3_000,
} as const satisfies VisitWindow;

export const REDIRECT_WINDOW = {
  beforeMs: 1_000,
  afterMs: 2_000,
} as const satisfies VisitWindow;

export function windowAround(time: number, visitWindow: VisitWindow): { from: number; to: number } {
  return {
    from: time - visitWindow.beforeMs,
    to: time + visitWindow.afterMs,
  };
}

export function windowAroundSpan(
  left: number,
  right: number,
  visitWindow: VisitWindow,
): { from: number; to: number } {
  return {
    from: Math.min(left, right) - visitWindow.beforeMs,
    to: Math.max(left, right) + visitWindow.afterMs,
  };
}
