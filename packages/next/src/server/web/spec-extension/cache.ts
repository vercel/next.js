type Callback = (...args: any[]) => Promise<any> | any

export function unstable_cache<T = Callback>(
  _cb: T,
  _keyParts: string[],
  _options: {
    revalidate: number | false
    tags?: string[]
  }
): T {
  return _cb
}
