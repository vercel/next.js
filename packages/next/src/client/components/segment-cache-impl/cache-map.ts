/**
 * A specialized data type for storing multi-key cache entries.
 *
 * The basic structure is a map whose keys are tuples, called the keypath.
 * When querying the cache, keypaths are compared per-element.
 *
 * Example:
 *   map.set(['https://localhost', 'foo/bar/baz'], 'yay');
 *   map.get(['https://localhost', 'foo/bar/baz']) -> 'yay'
 *
 * The parts of the keypath represent the different inputs that contribute
 * to the entry value. To illustrate, if you were to use this data type to store
 * HTTP responses, the keypath would include the URL and everything listed by
 * the Vary header.
 *
 * The order of elements in a keypath must be consistent between lookups to
 * be considered the same, but besides that, the order of the keys is not
 * semantically meaningful.
 *
 * Keypaths may include a special kind of key called Fallback. When an entry is
 * stored with Fallback as part of its keypath, it means that the entry does not
 * vary by that key. When querying the cache with getWithFallback, if an exact
 * match is not found for a keypath, the cache will check for a Fallback match
 * instead. Each element of the keypath may have a Fallback, so getWithFallback
 * is an O(n ^ 2) operation, but it's expected that keypaths are
 * relatively short.
 *
 * Example:
 *   map.set(['store', 'product', 1], PRODUCT_PAGE_1);
 *   map.set(['store', 'product', Fallback], GENERIC_PRODUCT_PAGE);
 *
 *   // Exact match
 *   map.getWithFallback(['store', 'product', 1]) -> PRODUCT_PAGE_1
 *
 *   // Fallback match
 *   map.getWithFallback(['store', 'product', 2]) -> GENERIC_PRODUCT_PAGE
 *
 * Because we have the Fallback mechanism, we can impose a constraint that
 * regular JS maps do not have: a value cannot be stored at multiple keypaths
 * simultaneously. These cases should be expressed with Fallback keys instead.
 *
 * Additionally, because values only exist at a single keypath at a time, we can
 * optimize successive lookups by caching the internal map entry on the value
 * itself, using the `ref` field.
 */

export type CacheMap<K extends readonly unknown[], V extends MapValue> = {
  set(key: K, value: V): void
  get(key: K): V | null
  getWithFallback(key: KeyWithFallback<K>): V | null
  getOrInitialize(key: K): MapEntry<V>
  delete(value: V): void
}

type MapEntryShared<V extends MapValue> = {
  parent: MapEntry<V> | null
  key: any
  map: Map<any, MapEntry<V>> | null
}

type EmptyMapEntry<V extends MapValue> = MapEntryShared<V> & {
  value: null
  hasValue: false
}

type FullMapEntry<V extends MapValue> = MapEntryShared<V> & {
  value: V
  hasValue: true
}

export type MapEntry<V extends MapValue> = EmptyMapEntry<V> | FullMapEntry<V>

// The protocol that values must implement. In practice, the only two types that
// we ever actually deal with in this module are RouteCacheEntry and
// SegmentCacheEntry; this is just to keep track of the coupling so we don't
// leak concerns between the modules unnecessarily.
interface MapValue {
  ref: MapEntry<any> | null
}

type KeyWithFallback<K extends readonly unknown[]> = {
  [I in keyof K]: K[I] | FallbackType
}

export type FallbackType = { __brand: 'Fallback' }
export const Fallback = {} as FallbackType

export function createCacheMap<
  Keypath extends Array<any>,
  V extends MapValue,
>(): CacheMap<Keypath, V> {
  let rootEntry: MapEntry<V> = {
    parent: null,
    key: null,
    hasValue: false,
    value: null,
    map: null,
  }

  function getOrInitialize(keys: Keypath): MapEntry<V> {
    // Go through each level of keys until we find the entry that matches, or
    // create a new entry if one doesn't exist.
    //
    // This function will only return entries that match the keypath _exactly_.
    // Unlike getWithFallback, it will not access fallback entries unless it's
    // explicitly part of the keypath.
    let entry = rootEntry
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      let map = entry.map
      if (map !== null) {
        const existingEntry = map.get(key)
        if (existingEntry !== undefined) {
          // Found a match. Keep going.
          entry = existingEntry
          continue
        }
      } else {
        map = new Map()
        entry.map = map
      }
      // No entry exists yet at this level. Create a new one.
      const newEntry: EmptyMapEntry<V> = {
        parent: entry,
        key,
        value: null,
        hasValue: false,
        map: null,
      }
      map.set(key, newEntry)
      entry = newEntry
    }

    return entry
  }

  function getEntryIfExists(keys: Keypath): MapEntry<V> | null {
    // Go through each level of keys until we find the entry that matches, or
    // return null if no match exists.
    //
    // This function will only return entries that match the keypath _exactly_.
    // Unlike getWithFallback, it will not access fallback entries unless it's
    // explicitly part of the keypath.
    let entry = rootEntry
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      let map = entry.map
      if (map !== null) {
        const existingEntry = map.get(key)
        if (existingEntry !== undefined) {
          // Found a match. Keep going.
          entry = existingEntry
          continue
        }
      }
      // No entry exists at this level.
      return null
    }

    return entry
  }

  function getWithFallback(keys: Keypath): V | null {
    const entry = getEntryWithFallbackImpl(rootEntry, keys, 0)
    if (entry === null || !entry.hasValue) {
      return null
    }
    return entry.value
  }

  function getEntryWithFallbackImpl(
    entry: MapEntry<V>,
    keys: Keypath,
    index: number
  ): MapEntry<V> | null {
    // This is similar to getExactEntry, but if an exact match is not found for
    // a key, it will return the fallback entry instead. This is recursive at
    // every level, e.g. an entry with keypath [a, Fallback, c, Fallback] is
    // valid match for [a, b, c, d].
    //
    // It will return the most specific match available.
    if (index >= keys.length) {
      return entry
    }
    const key = keys[index]
    const map = entry.map
    if (map !== null) {
      const existingEntry = map.get(key)
      if (existingEntry !== undefined) {
        // Found an exact match for this key. Keep searching.
        const result = getEntryWithFallbackImpl(existingEntry, keys, index + 1)
        if (result !== null) {
          return result
        }
      }
      // No match found for this key. Check if there's a fallback.
      const fallbackEntry = map.get(Fallback)
      if (fallbackEntry !== undefined) {
        // Found a fallback for this key. Keep searching.
        return getEntryWithFallbackImpl(fallbackEntry, keys, index + 1)
      }
    }
    return null
  }

  function set(keys: Keypath, value: V): void {
    // Add a value to the map at the given keypath. If the value is already
    // part of the map, it's removed from its previous keypath. (NOTE: This is
    // unlike a regular JS map, but the behavior is intentional.)
    const entry = getOrInitialize(keys)
    if (entry.hasValue) {
      // There's already a value at the given keypath. Disconnect the old value
      // from the map. We're not calling `deleteMapEntry` here because the
      // entry itself is still in the map. We just want to overwrite its value.
      dropRef(entry.value)

      // Fill the entry with the updated value.
      const emptyEntry: EmptyMapEntry<V> = entry as any
      emptyEntry.hasValue = false
      emptyEntry.value = null
      fillEmptyReference(emptyEntry, value)
    } else {
      fillEmptyReference(entry as any, value)
    }
  }

  function fillEmptyReference(entry: EmptyMapEntry<V>, value: V): void {
    // This value may already be in the map at a different keypath.
    // Grab a reference before we overwrite it.
    const oldEntry = value.ref

    const fullEntry: FullMapEntry<V> = entry as any
    fullEntry.hasValue = true
    fullEntry.value = value
    value.ref = fullEntry

    if (oldEntry !== null && oldEntry !== entry && oldEntry.hasValue) {
      // This value is already in the map at a different keypath in the map.
      // Values only exist at a single keypath at a time. Remove it from the
      // previous keypath.
      //
      // Note that only the internal map entry is garbage collected; we don't
      // call `dropRef` here because it's still in the map, just
      // at a new keypath (the one we just set, above).
      deleteMapEntry(oldEntry)
    }
  }

  function get(keys: Keypath): V | null {
    const entry = getEntryIfExists(keys)
    if (entry === null || !entry.hasValue) {
      return null
    }
    return entry.value
  }

  function deleteValue(value: V): void {
    const entry = value.ref
    if (entry === null) {
      // This value is not a member of the map.
      return
    }

    dropRef(value)
    deleteMapEntry(entry)
  }

  function dropRef(value: V): void {
    // Drop the value from the map by setting its `ref` backpointer to
    // null. This is a separate operation from `deleteMapEntry` because when
    // re-keying a value we need to be able to delete the old, internal map
    // entry without garbage collecting the value itself.
    // TODO: We should also remove the old value from the LRU here, so the LRU
    // doesn't unnecessarily retain it. We should do this by calling
    // `deleteNode` directly. It's fine for the LRU and map modules to have some
    // coupling like this when reasonable; they're only separate modules to keep
    // the implementation organized, not because they need to be super generic.
    value.ref = null
  }

  function deleteMapEntry(entry: MapEntry<V>): void {
    // Delete the entry from the cache.
    const emptyEntry: EmptyMapEntry<V> = entry as any
    emptyEntry.hasValue = false
    emptyEntry.value = null

    // Check if we can garbage collect the entry.
    if (emptyEntry.map === null) {
      // Since this entry has no value, and also no child entries, we can
      // garbage collect it. Remove it from its parent, and keep garbage
      // collecting the parents until we reach a non-empty entry.
      let parent = emptyEntry.parent
      let key = emptyEntry.key
      while (parent !== null) {
        const parentMap = parent.map
        if (parentMap !== null) {
          parentMap.delete(key)
          if (parentMap.size === 0) {
            // We just removed the last entry in the parent map.
            parent.map = null
            if (!parent.hasValue) {
              // The parent node has no child entries, nor does it have a value
              // on itself. It can be garbage collected. Keep going.
              key = parent.key
              parent = parent.parent
              continue
            }
          }
        }
        // The parent is not empty. Stop garbage collecting.
        break
      }
    }
  }

  return {
    set,
    get,
    getOrInitialize,
    delete: deleteValue,
    getWithFallback,
  }
}
