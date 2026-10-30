import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultViewState,
  loadViewState,
  saveViewState,
  type ViewState,
} from '../entrypoints/history/lib/viewState';

const STORAGE_KEY = 'history-vault:view-state';

beforeEach(() => {
  localStorage.clear();
});

describe('view state', () => {
  it('starts with the stats panel closed', () => {
    const state = defaultViewState();

    expect(state.calendarVisible).toBe(true);
    expect(state.statsVisible).toBe(false);
  });

  it('round-trips the current shape', () => {
    const state: ViewState = {
      selectedDate: new Date(2026, 8, 15).getTime(),
      calendarVisible: false,
      statsVisible: true,
    };

    saveViewState(state);

    expect(loadViewState()).toEqual(state);
  });

  it('drops the old view mode and closes the stats panel once', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        view: 'month',
        selectedDate: new Date(2026, 8, 15).getTime(),
        calendarVisible: false,
        statsVisible: true,
      }),
    );

    const state = loadViewState();

    expect(state).not.toHaveProperty('view');
    expect(state.selectedDate).toBe(new Date(2026, 8, 15).getTime());
    expect(state.calendarVisible).toBe(false);
    expect(state.statsVisible).toBe(false);
  });

  it('falls back to defaults for invalid data', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    const state = loadViewState();

    expect(state.calendarVisible).toBe(true);
    expect(state.statsVisible).toBe(false);
  });
});
