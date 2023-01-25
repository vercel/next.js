export function resolveAsArrayOrUndefined<T = any>(
  value: T | T[] | undefined | null
): undefined | T[] {
  if (typeof value === 'undefined' || value === null) {
    return undefined
  }
  if (Array.isArray(value)) {
    return value
  }
  return [value]
}
