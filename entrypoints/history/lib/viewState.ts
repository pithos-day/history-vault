export interface ViewState {
  selectedDate: number;
  calendarVisible: boolean;
  statsVisible: boolean;
}

const STORAGE_KEY = 'history-vault:view-state';

export function defaultViewState(): ViewState {
  return {
    selectedDate: Date.now(),
    calendarVisible: true,
    statsVisible: false,
  };
}

export function loadViewState(): ViewState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultViewState();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return defaultViewState();

    const selectedDate = typeof parsed.selectedDate === 'number' ? parsed.selectedDate : Date.now();
    const calendarVisible =
      typeof parsed.calendarVisible === 'boolean' ? parsed.calendarVisible : true;
    // Older versions stored a view mode and defaulted the stats panel to open.
    // The list+calendar layout now starts with the panel closed.
    const statsVisible =
      'view' in parsed
        ? false
        : typeof parsed.statsVisible === 'boolean'
          ? parsed.statsVisible
          : false;

    return { selectedDate, calendarVisible, statsVisible };
  } catch {
    return defaultViewState();
  }
}

export function saveViewState(state: ViewState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // View state is a convenience; ignore storage failures.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
