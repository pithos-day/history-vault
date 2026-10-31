import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyInitialHistoryDate,
  defaultViewState,
  loadViewState,
  saveViewState,
  type ViewState,
} from '../entrypoints/history/lib/viewState';

const STORAGE_KEY = 'history-vault:view-state';
const NOW = new Date(2026, 9, 31, 12).getTime();

beforeEach(() => {
  localStorage.clear();
});

describe('view state', () => {
  it('starts with the stats panel closed', () => {
    const state = defaultViewState(NOW);

    expect(state.selectedDate).toBe(NOW);
    expect(state.calendarVisible).toBe(true);
    expect(state.statsVisible).toBe(false);
  });

  it('restores the layout without the previously selected date', () => {
    const state: ViewState = {
      selectedDate: new Date(2026, 8, 15).getTime(),
      calendarVisible: false,
      statsVisible: true,
    };

    saveViewState(state);

    expect(loadViewState(NOW)).toEqual({
      selectedDate: NOW,
      calendarVisible: false,
      statsVisible: true,
    });
  });

  it('does not persist the selected date', () => {
    saveViewState({
      selectedDate: new Date(2026, 8, 15).getTime(),
      calendarVisible: false,
      statsVisible: true,
    });

    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('selectedDate');
  });

  it('moves to the newest history date unless the user already picked one', () => {
    const initial = defaultViewState(NOW);
    const latest = new Date(2026, 8, 15).getTime();

    expect(applyInitialHistoryDate(initial, NOW, latest).selectedDate).toBe(latest);

    const picked: ViewState = { ...initial, selectedDate: latest };
    expect(applyInitialHistoryDate(picked, NOW, NOW)).toBe(picked);
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

    const state = loadViewState(NOW);

    expect(state).not.toHaveProperty('view');
    expect(state.selectedDate).toBe(NOW);
    expect(state.calendarVisible).toBe(false);
    expect(state.statsVisible).toBe(false);
  });

  it('falls back to defaults for invalid data', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    const state = loadViewState(NOW);

    expect(state.selectedDate).toBe(NOW);
    expect(state.calendarVisible).toBe(true);
    expect(state.statsVisible).toBe(false);
  });
});
