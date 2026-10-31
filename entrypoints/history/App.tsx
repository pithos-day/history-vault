import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  addMonths,
  clampDateToMonth,
  dayKey,
  formatDateHeader,
  formatDateRange,
  getMonthRange,
  isSameMonth,
  startOfMonth,
} from '@/utils/date';
import type { EntryGroup } from '@/utils/history/types';
import { sendVaultMessage } from '@/utils/messages';
import { isSupportedUrl } from '@/utils/url';
import { CalendarSidebar } from './components/CalendarSidebar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ContextMenu } from './components/ContextMenu';
import { GroupedHistoryList } from './components/GroupedHistoryList';
import { ImportBanner } from './components/ImportBanner';
import { SearchResults } from './components/SearchResults';
import { SettingsDialog } from './components/SettingsDialog';
import { StatsPanel } from './components/StatsPanel';
import { TopBar } from './components/TopBar';
import { WelcomeDialog } from './components/WelcomeDialog';
import { useDebouncedVaultRevision } from './hooks/useDebouncedVaultRevision';
import { useEntriesInRange } from './hooks/useEntriesInRange';
import { useImportRunner } from './hooks/useImportRunner';
import { useImportState } from './hooks/useImportState';
import { useRangeStats } from './hooks/useRangeStats';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import { useSearch } from './hooks/useSearch';
import { useSettings } from './hooks/useSettings';
import { useVaultOverview } from './hooks/useVaultOverview';
import { useVaultRevision } from './hooks/useVaultRevision';
import { loadViewState, saveViewState, type ViewState } from './lib/viewState';

const MAX_CALENDAR_MONTHS = 24;

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
  const dataRevision = useDebouncedVaultRevision(revision, 400);
  const { settings, loaded, updateSettings } = useSettings();
  const theme = useResolvedTheme(settings.theme);
  const importState = useImportState();
  const [viewState, setViewState] = useState<ViewState>(() => loadViewState());
  const [focusToken, setFocusToken] = useState(0);
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
  const range = useMemo(() => getMonthRange(selectedDate), [selectedDate]);
  const searching = query.trim().length > 0;
  const showWelcome = welcomeOpen || (loaded && !settings.onboardingDone);

  const { stats, loading: statsLoading } = useRangeStats(
    range.start,
    range.end,
    'day',
    dataRevision,
    !searching && viewState.statsVisible,
  );
  const {
    days: listDays,
    loading: listLoading,
    loadingMore: listLoadingMore,
    hasMore: listHasMore,
    loadMore: loadMoreEntries,
  } = useEntriesInRange(range.start, range.end, dataRevision, !searching);
  const { results, loading: searchLoading } = useSearch(query, dataRevision);
  const { activity: calendarActivity, bounds } = useVaultOverview(dataRevision);
  const calendarMonths = useMemo(
    () => buildCalendarMonths(bounds, selectedDate),
    [bounds, selectedDate],
  );

  const title = searching ? '検索結果' : formatDateRange(range.start, range.end);

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
    setFocusToken((current) => current + 1);
  }, []);

  const handlePrevious = useCallback(() => {
    setViewState((current) => ({
      ...current,
      selectedDate: shiftMonth(new Date(current.selectedDate), -1).getTime(),
    }));
  }, []);

  const handleNext = useCallback(() => {
    setViewState((current) => ({
      ...current,
      selectedDate: shiftMonth(new Date(current.selectedDate), 1).getTime(),
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
        message: `「${entry.title}」を${formatDateHeader(entry.latestVisit)}のVault履歴から削除しますか？この操作は元に戻せません。`,
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
        query={query}
        searchInputRef={searchInputRef}
        statsVisible={viewState.statsVisible}
        title={title}
      />

      {!dismissedImport ? (
        <ImportBanner
          onDismiss={() => setDismissedImport(true)}
          onStart={handleStartImport}
          state={importState}
        />
      ) : null}

      <div className={`content ${viewState.statsVisible && !searching ? '' : 'no-stats'}`}>
        <main className="main-pane">
          <div className={`workspace ${viewState.calendarVisible ? '' : 'calendar-hidden'}`}>
            {viewState.calendarVisible ? (
              <CalendarSidebar
                activity={calendarActivity}
                months={calendarMonths}
                onSelect={handleSelectDate}
                selectedDate={selectedDate}
                theme={theme}
                weekStartsOn={settings.weekStartsOn}
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
              <GroupedHistoryList
                ariaLabel="履歴リスト"
                days={listDays}
                emptyText="この月の履歴はありません。"
                focusDate={dayKey(selectedDate)}
                focusToken={focusToken}
                hasMore={listHasMore}
                loading={listLoading}
                loadingMore={listLoadingMore}
                onContextMenu={handleContextMenu}
                onDeleteDay={handleDeleteDay}
                onLoadMore={loadMoreEntries}
                onOpen={handleOpen}
              />
            )}
          </div>
        </main>

        {viewState.statsVisible && !searching ? (
          <StatsPanel
            label={formatDateRange(range.start, range.end)}
            loading={statsLoading}
            onClose={handleToggleStats}
            stats={stats}
          />
        ) : null}
      </div>

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
          importState={importState}
          onClearVault={handleClearVault}
          onClose={() => setSettingsOpen(false)}
          onStartImport={handleStartImport}
          onToast={showToast}
          onUpdate={updateSettings}
          revision={dataRevision}
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

function buildCalendarMonths(
  bounds: { earliest: number; latest: number } | null,
  selectedDate: Date,
): Date[] {
  const selected = selectedDate.getTime();
  const first = startOfMonth(Math.min(bounds?.earliest ?? selected, selected));
  const last = startOfMonth(Math.max(bounds?.latest ?? selected, selected));
  const months: Date[] = [];

  for (let cursor = first; cursor.getTime() <= last.getTime(); cursor = addMonths(cursor, 1)) {
    months.push(cursor);
  }

  if (months.length <= MAX_CALENDAR_MONTHS) return months;

  const selectedIndex = months.findIndex((month) => isSameMonth(month, selectedDate));
  const startIndex = Math.max(0, Math.min(months.length - MAX_CALENDAR_MONTHS, selectedIndex - 11));
  return months.slice(startIndex, startIndex + MAX_CALENDAR_MONTHS);
}
