/**
 * `app` -> app dir
 * `pages` -> pages dir
 * `root` -> middleware / instrumentation
 * `assets` -> assets
 */
export type EntryKeyType = 'app' | 'pages' | 'root' | 'assets'
export type EntryKeySide = 'client' | 'server'

// custom type to make sure you can't accidentally use a "generic" string
export type EntryKey =
  `{"type":"${EntryKeyType}","side":"${EntryKeyType}","page":"${string}"}`

/**
 * Get a key that's unique across all entrypoints.
 */
export function getEntryKey(
  type: EntryKeyType,
  side: EntryKeySide,
  page: string
): EntryKey {
  return JSON.stringify({ type, side, page }) as EntryKey
}

/**
 * Split an `EntryKey` up into its components.
 */
export function splitEntryKey(key: EntryKey): {
  type: EntryKeyType
  side: EntryKeySide
  page: string
} {
  return JSON.parse(key)
}
