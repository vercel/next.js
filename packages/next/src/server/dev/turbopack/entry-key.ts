/**
 * `app` -> app dir
 * `pages` -> pages dir
 * `root` -> middleware / instrumentation
 * `assets` -> assets
 */
export type EntryKeyType = 'app' | 'pages' | 'root' | 'assets'
export type EntryKeySide = 'client' | 'server'

export type EntryKey = `${EntryKeyType}@${EntryKeySide}@${string}`

/**
 * Get a key that's unique across all entrypoints.
 */
export function getEntryKey<
  Type extends EntryKeyType,
  Side extends EntryKeySide,
  Page extends string
>(type: Type, side: Side, page: Page): `${Type}@${Side}@${Page}` {
  return `${type}@${side}@${page}` satisfies EntryKey
}

export function splitEntryKey<
  Type extends EntryKeyType = EntryKeyType,
  Side extends EntryKeySide = EntryKeySide,
  Page extends string = string
>(key: `${Type}@${Side}@${Page}`): [Type, Side, Page] {
  // export function splitEntryKey(
  //   key: EntryKey
  // ): [EntryKeyType, EntryKeySide, string] {
  const split = key.split('@')

  if (split.length !== 3) {
    throw new Error(`invalid entry key: ${key}`)
  }

  return [split[0] as Type, split[1] as Side, split[2] as Page]
}
