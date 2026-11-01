export const TRANSITION_CATEGORIES = [
  'direct',
  'typed',
  'link',
  'reload',
  'form',
  'other',
] as const;

export type TransitionCategory = (typeof TRANSITION_CATEGORIES)[number];

export type TransitionCounts = Record<TransitionCategory, number>;

export interface DomainCount {
  host: string;
  count: number;
}

export interface PageRecord {
  url: string;
  title: string;
  host: string;
  titleLower: string;
  urlLower: string;
  lastVisitTime: number;
  firstVisitTime: number;
  visitCount: number;
}

export interface VisitRecord {
  id: string;
  url: string;
  host: string;
  visitedAt: number;
  transition: string;
  referringVisitId?: string;
  source: 'live' | 'import' | 'fallback';
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface ActivityPoint {
  label: string;
  start: number;
  views: number;
  pages: number;
}

export interface RangeStats {
  start: number;
  end: number;
  views: number;
  series: ActivityPoint[];
  transitions: TransitionCounts;
  topDomains: DomainCount[];
  domainCount: number;
  maxViews: number;
}

export interface EntryGroup {
  url: string;
  title: string;
  host: string;
  latestVisit: number;
  count: number;
}

export interface DayEntries {
  date: string;
  start: number;
  entries: EntryGroup[];
}

export interface SearchResult {
  page: PageRecord;
  latestVisitTime: number;
  count: number;
}

export interface CalendarDayActivity {
  views: number;
  pages: number;
}

export interface DayActivityRecord extends CalendarDayActivity {
  date: string;
}

export interface RedirectMarker {
  url: string;
  from: number;
  to: number;
}

type ImportPhase = 'idle' | 'running' | 'done' | 'error' | 'cancelled';

export interface ImportState {
  phase: ImportPhase;
  startedAt: number;
  updatedAt: number;
  cursorEnd: number;
  windowStart: number;
  daysDone: number;
  daysTotal: number;
  pages: number;
  visits: number;
  emptyStreak: number;
  error?: string;
}
