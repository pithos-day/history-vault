import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  addDays,
  addMonths,
  clampDateToMonth,
  dayKey,
  formatDateHeader,
  formatDateRange,
  formatMonthLabel,
  getDayRange,
  getMonthRange,
  getWeekRange,
  startOfWeek,
} from '@/utils/date';
import type { EntryGroup } from '@/utils/history/types';
import { sendVaultMessage } from '@/utils/messages';
import { isSupportedUrl } from '@/utils/url';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ContextMenu } from './components/ContextMenu';
import { DateRail } from './components/DateRail';
import { DayView } from './components/DayView';
import { EntriesPanel } from './components/EntriesPanel';
import { ImportBanner } from './components/ImportBanner';
import { ListView } from './components/ListView';
import { MonthCalendar } from './components/MonthCalendar';
import { SearchResults } from './components/SearchResults';
import { SettingsDialog } from './components/SettingsDialog';
import { StatsPanel } from './components/StatsPanel';
import { TopBar } from './components/TopBar';
import { WeekView } from './components/WeekView';
import { WelcomeDialog } from './components/WelcomeDialog';
import { useDayEntries } from './hooks/useDayEntries';
import { useEntriesInRange } from './hooks/useEntriesInRange';
import { useImportRunner } from './hooks/useImportRunner';
import { useImportState } from './hooks/useImportState';
import { useRangeStats } from './hooks/useRangeStats';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import { useSearch } from './hooks/useSearch';
import { useSettings } from './hooks/useSettings';
import { useVaultCounts } from './hooks/useVaultCounts';
import { useVaultRevision } from './hooks/useVaultRevision';
import { loadViewState, saveViewState, type ViewMode, type ViewState } from './lib/viewState';

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  action: () => void | Promise<void>;
}

interface ToastState {
  id: number;
  message: string;
}

export default function App() {
  const revision = useVaultRevision();
  const { settings, loaded, updateSettings } = useSettings();
  const theme = useResolvedTheme(settings.theme);
  const importState = useImportState();
  const counts = useVaultCounts(revision);
  const [viewState, setViewState] = useState<ViewState>(() => loadViewState());
  const [query, setQuery] = useState(() => getInitialQuery());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(() => hasWelcomeParam());
  const [dismissedImport, setDismissedImport] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: EntryGroup;
  } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useImportRunner(importState);

  const selectedTime = viewState.selectedDate;
  const selectedDate = useMemo(() => new Date(selectedTime), [selectedTime]);
  const weekStartsOn = settings.weekStartsOn;

  const range = useMemo(() => {
    switch (viewState.view) {
      case 'day':
        return getDayRange(selectedDate);
      case 'week':
        return getWeekRange(selectedDate, weekStartsOn);
      default:
        return getMonthRange(selectedDate);
    }
  }, [selectedDate, viewState.view, weekStartsOn]);

  const weekStart = useMemo(
    () => startOfWeek(selectedDate, weekStartsOn),
    [selectedDate, weekStartsOn],
  );

  const searching = query.trim().length > 0;
  const showWelcome = welcomeOpen || (loaded && !settings.onboardingDone);
  const statsEnabled = !searching && (viewState.view !== 'list' || viewState.statsVisible);
  const { stats, loading: statsLoading } = useRangeStats(
    range.start,
    range.end,
    viewState.view === 'day' ? 'hour' : 'day',
    revision,
    statsEnabled,
  );
  const { entries, loading: entriesLoading } = useDayEntries(selectedDate, revision);
  const { days: listDays, loading: listLoading } = useEntriesInRange(
    range.start,
    range.end,
    revision,
    viewState.view === 'list' && !searching,
  );
  const { results, loading: searchLoading } = useSearch(query, revision);

  const daysMap = useMemo(
    () => new Map((stats?.days ?? []).map((day) => [day.date, day])),
    [stats],
  );

  const title = searching
    ? '検索結果'
    : viewState.view === 'week'
      ? formatDateRange(range.start, range.end)
      : viewState.view === 'day'
        ? formatDateHeader(selectedDate)
        : formatMonthLabel(selectedDate);

  useEffect(() => {
    saveViewState(viewState);
  }, [viewState]);

  useEffect(() => {
    if (!getInitialFocus()) return;
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    void navigator.storage?.persist?.();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === 'Escape') {
        setQuery('');
        setContextMenu(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast({ id: Date.now(), message });
  }, []);

  const handleOpen = useCallback(
    (url: string) => {
      if (!isSupportedUrl(url)) {
        showToast('このURLは開けません。');
        return;
      }

      void browser.tabs.create({ url }).catch(() => showToast('タブを開けませんでした。'));
    },
    [showToast],
  );

  const handleCopy = useCallback(
    (url: string) => {
      void navigator.clipboard
        .writeText(url)
        .then(() => showToast('URLをコピーしました。'))
        .catch(() => showToast('URLをコピーできませんでした。'));
    },
    [showToast],
  );

  const handleSelectDate = useCallback((date: Date) => {
    setViewState((current) => ({ ...current, selectedDate: date.getTime() }));
  }, []);

  const handleViewChange = useCallback((view: ViewMode) => {
    setViewState((current) => ({ ...current, view }));
  }, []);

  const handlePrevious = useCallback(() => {
    setViewState((current) => ({
      ...current,
      selectedDate:
        current.view === 'month' || current.view === 'list'
          ? shiftMonth(new Date(current.selectedDate), -1).getTime()
          : addDays(current.selectedDate, current.view === 'week' ? -7 : -1).getTime(),
    }));
  }, []);

  const handleNext = useCallback(() => {
    setViewState((current) => ({
      ...current,
      selectedDate:
        current.view === 'month' || current.view === 'list'
          ? shiftMonth(new Date(current.selectedDate), 1).getTime()
          : addDays(current.selectedDate, current.view === 'week' ? 7 : 1).getTime(),
    }));
  }, []);

  const handleToday = useCallback(() => {
    setViewState((current) => ({ ...current, selectedDate: Date.now() }));
  }, []);

  const handleToggleCalendar = useCallback(() => {
    setViewState((current) => ({ ...current, calendarVisible: !current.calendarVisible }));
  }, []);

  const handleToggleStats = useCallback(() => {
    setViewState((current) => ({ ...current, statsVisible: !current.statsVisible }));
  }, []);

  const handleContextMenu = useCallback((entry: EntryGroup, event: MouseEvent) => {
    setContextMenu({ x: event.clientX, y: event.clientY, entry });
  }, []);

  const handleDeleteEntry = useCallback(
    (entry: EntryGroup) => {
      setContextMenu(null);
      setConfirmState({
        title: '履歴を削除',
        message: `「${entry.title}」をVaultから削除しますか？この操作は元に戻せません。`,
        confirmLabel: '削除',
        danger: true,
        action: async () => {
          const response = await sendVaultMessage({
            type: 'delete-url',
            url: entry.url,
            date: dayKey(entry.latestVisit),
          });
          if (!response.ok) showToast(response.error);
          else showToast('履歴を削除しました。');
        },
      });
    },
    [showToast],
  );

  const handleDeleteDay = useCallback(
    (date: Date) => {
      setConfirmState({
        title: 'この日の履歴を削除',
        message: `${formatDateHeader(date)}の履歴をVaultから削除しますか？この操作は元に戻せません。`,
        confirmLabel: '削除',
        danger: true,
        action: async () => {
          const response = await sendVaultMessage({ type: 'delete-day', date: dayKey(date) });
          if (!response.ok) showToast(response.error);
          else showToast('この日の履歴を削除しました。');
        },
      });
    },
    [showToast],
  );

  const handleClearVault = useCallback(() => {
    setConfirmState({
      title: 'Vaultを全消去',
      message:
        '保存されているすべてのページと訪問履歴を削除します。この操作は元に戻せません。必要なら先にエクスポートしてください。',
      confirmLabel: '全消去',
      danger: true,
      action: async () => {
        const response = await sendVaultMessage({ type: 'clear-vault' });
        if (!response.ok) showToast(response.error);
        else {
          setSettingsOpen(false);
          showToast('Vaultを全消去しました。');
        }
      },
    });
  }, [showToast]);

  const handleStartImport = useCallback(() => {
    setDismissedImport(false);
    void sendVaultMessage({ type: 'start-import', reset: true }).then((response) => {
      if (!response.ok) showToast(response.error);
      else showToast('履歴のインポートを開始しました。');
    });
  }, [showToast]);

  const handleCloseWelcome = useCallback(() => {
    setWelcomeOpen(false);
    void updateSettings({ onboardingDone: true });
    const url = new URL(window.location.href);
    url.searchParams.delete('welcome');
    url.searchParams.delete('focus');
    window.history.replaceState({}, '', url);
  }, [updateSettings]);

  const runConfirm = useCallback(async () => {
    if (!confirmState) return;
    const action = confirmState.action;
    setConfirmState(null);
    await action();
  }, [confirmState]);

  return (
    <div className="app">
      <TopBar
        calendarVisible={viewState.calendarVisible}
        onNext={handleNext}
        onOpenSettings={() => setSettingsOpen(true)}
        onPrevious={handlePrevious}
        onQueryChange={setQuery}
        onToday={handleToday}
        onToggleCalendar={handleToggleCalendar}
        onToggleStats={handleToggleStats}
        onViewChange={handleViewChange}
        query={query}
        searchInputRef={searchInputRef}
        statsVisible={viewState.statsVisible}
        title={title}
        view={viewState.view}
      />

      {!dismissedImport ? (
        <ImportBanner
          onDismiss={() => setDismissedImport(true)}
          onStart={handleStartImport}
          state={importState}
        />
      ) : null}

      {searching ? (
        <SearchResults
          loading={searchLoading}
          onContextMenu={handleContextMenu}
          onOpen={handleOpen}
          query={query.trim()}
          results={results}
        />
      ) : (
        <div className={`content ${viewState.statsVisible ? '' : 'no-stats'}`}>
          <main className="main-pane">
            {viewState.view === 'month' ? (
              <div className={`workspace ${viewState.calendarVisible ? '' : 'calendar-hidden'}`}>
                {viewState.calendarVisible ? (
                  <MonthCalendar
                    days={daysMap}
                    maxViews={stats?.maxViews ?? 0}
                    month={selectedDate}
                    onSelect={handleSelectDate}
                    selectedDate={selectedDate}
                    theme={theme}
                    weekStartsOn={weekStartsOn}
                  />
                ) : (
                  <DateRail
                    days={daysMap}
                    month={selectedDate}
                    onSelect={handleSelectDate}
                    selectedDate={selectedDate}
                  />
                )}
                <EntriesPanel
                  date={selectedDate}
                  entries={entries}
                  loading={entriesLoading}
                  onContextMenu={handleContextMenu}
                  onDeleteDay={handleDeleteDay}
                  onOpen={handleOpen}
                />
              </div>
            ) : null}

            {viewState.view === 'week' ? (
              <div className="workspace">
                <WeekView
                  days={daysMap}
                  maxViews={stats?.maxViews ?? 0}
                  onSelect={handleSelectDate}
                  selectedDate={selectedDate}
                  theme={theme}
                  weekStart={weekStart}
                />
                <EntriesPanel
                  date={selectedDate}
                  entries={entries}
                  loading={entriesLoading}
                  onContextMenu={handleContextMenu}
                  onDeleteDay={handleDeleteDay}
                  onOpen={handleOpen}
                />
              </div>
            ) : null}

            {viewState.view === 'day' ? (
              <DayView
                date={selectedDate}
                entries={entries}
                loading={entriesLoading}
                onContextMenu={handleContextMenu}
                onDeleteDay={handleDeleteDay}
                onOpen={handleOpen}
                stats={stats}
              />
            ) : null}

            {viewState.view === 'list' ? (
              <ListView
                days={listDays}
                loading={listLoading}
                onContextMenu={handleContextMenu}
                onOpen={handleOpen}
              />
            ) : null}
          </main>

          {viewState.statsVisible ? (
            <StatsPanel
              label={formatDateRange(range.start, range.end)}
              loading={statsLoading}
              onClose={handleToggleStats}
              stats={stats}
            />
          ) : null}
        </div>
      )}

      {contextMenu ? (
        <ContextMenu
          entry={contextMenu.entry}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onDelete={handleDeleteEntry}
          onOpen={handleOpen}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      ) : null}

      {confirmState ? (
        <ConfirmDialog
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          message={confirmState.message}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => void runConfirm()}
          title={confirmState.title}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          counts={counts}
          importState={importState}
          onClearVault={handleClearVault}
          onClose={() => setSettingsOpen(false)}
          onStartImport={handleStartImport}
          onToast={showToast}
          onUpdate={updateSettings}
          settings={settings}
        />
      ) : null}

      {showWelcome ? <WelcomeDialog onClose={handleCloseWelcome} /> : null}

      {toast ? (
        <div className="toast" key={toast.id} role="status">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

function getInitialQuery(): string {
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

function getInitialFocus(): boolean {
  return new URLSearchParams(window.location.search).get('focus') === 'search';
}

function hasWelcomeParam(): boolean {
  return new URLSearchParams(window.location.search).get('welcome') === '1';
}

function shiftMonth(date: Date, delta: number): Date {
  const shifted = addMonths(date, delta);
  return clampDateToMonth(new Date(shifted.getFullYear(), shifted.getMonth(), date.getDate()));
}
