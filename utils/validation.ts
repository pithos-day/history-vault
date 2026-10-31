export function isOneOf<T extends string | number>(
  value: unknown,
  options: readonly T[],
): value is T {
  return options.includes(value as T);
}
