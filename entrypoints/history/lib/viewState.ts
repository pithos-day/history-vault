export interface ViewState {
  selectedDate: number;
  calendarVisible: boolean;
  statsVisible: boolean;
}

const STORAGE_KEY = 'history-vault:view-state';

export function defaultViewState(now = Date.now()): ViewState {
  return {
    selectedDate: now,
    calendarVisible: true,
    statsVisible: false,
  };
}

export function loadViewState(now = Date.now()): ViewState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultViewState(now);
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return defaultViewState(now);

    const calendarVisible =
      typeof parsed.calendarVisible === 'boolean' ? parsed.calendarVisible : true;
    // Older versions stored a view mode and defaulted the stats panel to open.
    // The list+calendar layout now starts with the panel closed.
    const statsVisible = !('view' in parsed) && parsed.statsVisible === true;

    // The selected date is intentionally not restored: every visit to the
    // history page should start at the newest history rather than the month
    // that happened to be open when the page was last closed.
    return { selectedDate: now, calendarVisible, statsVisible };
  } catch {
    return defaultViewState(now);
  }
}

export function saveViewState(state: ViewState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        calendarVisible: state.calendarVisible,
        statsVisible: state.statsVisible,
      }),
    );
  } catch {
    // View state is a convenience; ignore storage failures.
  }
}

/**
 * Moves the initial view to the newest history date. A date the user picked
 * while the overview was loading is left untouched.
 */
export function applyInitialHistoryDate(
  state: ViewState,
  initialSelectedDate: number,
  latest: number,
): ViewState {
  if (state.selectedDate !== initialSelectedDate) return state;
  return { ...state, selectedDate: latest };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
