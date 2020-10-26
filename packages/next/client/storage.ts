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

export function canUseLocalStorage(): boolean {
  const key = '__TEST_LOCAL_STORAGE__'
  try {
    window.localStorage.setItem(key, '1')
    window.localStorage.getItem(key)
    window.localStorage.removeItem(key)
    return true
  } catch (_) {
    return false
  }
}
