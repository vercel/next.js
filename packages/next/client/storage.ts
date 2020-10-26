export function localStorageGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch (_) {
    return null
  }
}

export function localStorageSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch (_) {}
}
