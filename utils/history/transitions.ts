import type { TransitionCategory, TransitionCounts } from './types';

export const TRANSITION_LABELS: Record<TransitionCategory, string> = {
  direct: '直接',
  typed: '入力',
  link: 'リンク',
  reload: '再読み込み',
  form: 'フォーム',
  other: 'その他',
};

export const TRANSITION_COLORS: Record<TransitionCategory, string> = {
  direct: '#4f83cc',
  typed: '#8e6bbf',
  link: '#e05a5a',
  reload: '#f2a541',
  form: '#7bb662',
  other: '#b7b7b7',
};

export function emptyTransitionCounts(): TransitionCounts {
  return {
    direct: 0,
    typed: 0,
    link: 0,
    reload: 0,
    form: 0,
    other: 0,
  };
}

export function categorizeTransition(transition: string | undefined): TransitionCategory {
  switch (transition) {
    case 'typed':
      return 'typed';
    case 'link':
      return 'link';
    case 'reload':
      return 'reload';
    case 'form_submit':
      return 'form';
    case 'generated':
    case 'keyword':
    case 'keyword_generated':
    case 'auto_toplevel':
      return 'direct';
    default:
      return 'other';
  }
}
