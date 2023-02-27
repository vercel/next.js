function resolveAsArrayOrUndefined<
  T extends (null | undefined) | readonly (null | undefined)[]
>(value: T | T[]): undefined
function resolveAsArrayOrUndefined<T extends unknown | readonly unknown[]>(
  value: T | T[]
): T[]
function resolveAsArrayOrUndefined<T extends unknown | readonly unknown[]>(
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

export { resolveAsArrayOrUndefined }
