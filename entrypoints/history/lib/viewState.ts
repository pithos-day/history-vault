export type ViewMode = 'month' | 'week' | 'day' | 'list';

export interface ViewState {
  view: ViewMode;
  selectedDate: number;
  calendarVisible: boolean;
  statsVisible: boolean;
}

const STORAGE_KEY = 'history-vault:view-state';

export function defaultViewState(): ViewState {
  return {
    view: 'month',
    selectedDate: Date.now(),
    calendarVisible: true,
    statsVisible: true,
  };
}

export function loadViewState(): ViewState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultViewState();
    const parsed: unknown = JSON.parse(raw);
    if (!isViewState(parsed)) return defaultViewState();
    return parsed;
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

function isViewState(value: unknown): value is ViewState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<ViewState>;
  return (
    (state.view === 'month' ||
      state.view === 'week' ||
      state.view === 'day' ||
      state.view === 'list') &&
    typeof state.selectedDate === 'number' &&
    typeof state.calendarVisible === 'boolean' &&
    typeof state.statsVisible === 'boolean'
  );
}
