function resolveArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) {
    return value as any
  }
  return [value] as any
}

function resolveAsArrayOrUndefined<T>(
  value: T | T[] | undefined | null
): T extends undefined | null ? undefined : T[] {
  if (typeof value === 'undefined' || value === null) {
    return undefined as any
  }
  return resolveArray(value) as any
}

export { resolveAsArrayOrUndefined, resolveArray }
