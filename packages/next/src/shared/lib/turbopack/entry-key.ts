import type { Page } from '../route-types'

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
  `{"type":"${EntryKeyType}","side":"${EntryKeySide}","page":"${string}"}`

/**
 * Get a key that's unique across all entrypoints.
 */
export function getEntryKey<Type extends EntryKeyType>(
  type: Type,
  side: EntryKeySide,
  page: Type extends 'app' | 'pages' ? Page : string
): EntryKey {
  return JSON.stringify({ type, side, page }) as EntryKey
}

/**
 * Split an `EntryKey` up into its components.
 */
export type EntryKeyParts =
  | { type: 'app' | 'pages'; side: EntryKeySide; page: Page }
  | { type: 'root' | 'assets'; side: EntryKeySide; page: string }

export function splitEntryKey(key: EntryKey): EntryKeyParts {
  return JSON.parse(key)
}
