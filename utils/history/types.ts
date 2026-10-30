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
  isLocal?: boolean;
  source: 'live' | 'import' | 'fallback';
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface DayStats {
  date: string;
  start: number;
  views: number;
  pages: number;
  topDomains: DomainCount[];
  transitions: TransitionCounts;
  hourly: number[];
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
  pages: number;
  days: DayStats[];
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
  transition: string;
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

export type ImportPhase = 'idle' | 'running' | 'done' | 'error';

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
