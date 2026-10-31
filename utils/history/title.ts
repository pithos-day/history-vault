const URL_LIKE_TITLE =
  /^(?:[a-z][a-z0-9+.-]*:\/\/|(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#]|$)|localhost(?::\d+)?(?:[/?#]|$))/i;

function isUrlLikeTitle(title: string | undefined, url: string): boolean {
  const value = title?.trim() ?? '';
  if (!value) return false;
  return value === url || URL_LIKE_TITLE.test(value);
}

/**
 * Chrome reports the current/previous URL as the title while a page has not
 * set one yet, especially for same-document navigations. Treat those as
 * missing so the UI can fall back to the URL and a later ingest can repair it.
 */
export function isUsableTitle(title: string | undefined, url: string): boolean {
  const value = title?.trim() ?? '';
  return Boolean(value) && !isUrlLikeTitle(value, url);
}

export function normalizeTitle(
  incoming: string | undefined,
  existing: string | undefined,
  url: string,
): string {
  const fresh = incoming?.trim() ?? '';
  if (isUsableTitle(fresh, url)) return fresh;

  const previous = existing?.trim() ?? '';
  return isUsableTitle(previous, url) ? previous : '';
}
