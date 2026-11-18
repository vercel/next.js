function resolveArray<T>(value: T | T[]): T[] {
  if (Array.isArray(value)) {
    return value
  }
  return [value]
}

function resolveAsArrayOrUndefined<T>(
  value: T | T[] | undefined | null
): T extends undefined | null ? undefined : T[] {
  if (typeof value === 'undefined' || value === null) {
    // TODO(as-any): pre-existing cast, not yet reviewed
    // eslint-disable-next-line @next/internal/no-as-any
    return undefined as any
  }
  // TODO(as-any): pre-existing cast, not yet reviewed
  // eslint-disable-next-line @next/internal/no-as-any
  return resolveArray(value) as any
}

function getOrigin(url: string | URL): string | undefined {
  let origin = undefined
  if (typeof url === 'string') {
    try {
      url = new URL(url)
      origin = url.origin
    } catch {}
  }
  return origin
}

export { resolveAsArrayOrUndefined, resolveArray, getOrigin }
