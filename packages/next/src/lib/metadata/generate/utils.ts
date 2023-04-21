function resolveArray<T>(value: T): T extends Array<any> ? T : T[] {
  if (Array.isArray(value)) {
    return value as any
  }
  return [value] as any
}

function resolveAsArrayOrUndefined<T>(
  value: T | undefined | null
): T extends undefined | null ? undefined : T extends Array<any> ? T : T[] {
  if (typeof value === 'undefined' || value === null) {
    return undefined as any
  }
  return resolveArray(value) as any
}

export { resolveAsArrayOrUndefined, resolveArray }
