import type { VaryPath } from './vary-path'
import { lruPut, updateLruSize, deleteFromLru } from './lru'

/**
 * A specialized data type for storing multi-key cache entries.
 *
 * The basic structure is a map whose keys are tuples, called the keypath.
 * When querying the cache, keypaths are compared per-element.
 *
 * Example:
 *   set(map, ['https://localhost', 'foo/bar/baz'], 'yay');
 *   get(map, ['https://localhost', 'foo/bar/baz']) -> 'yay'
 *
 * NOTE: Array syntax is used in these examples for illustration purposes, but
 * in reality the paths are lists.
 * 
 * The parts of the keypath represent the different inputs that contribute
 * to the entry value. To illustrate, if you were to use this data type to store
 * HTTP responses, the keypath would include the URL and everything listed by
 * the Vary header.
 * 
 * See vary-path.ts for more details.
 *
 * The order of elements in a keypath must be consistent between lookups to
 * be considered the same, but besides that, the order of the keys is not
 * semantically meaningful.
 *
 * Keypaths may include a special kind of key called Fallback. When an entry is
 * stored with Fallback as part of its keypath, it means that the entry does not
 * vary by that key. When querying the cache, if an exact match is not found for
 * a keypath, the cache will check for a Fallback match instead. Each element of
 * the keypath may have a Fallback, so retrieval is an O(n ^ 2) operation, but
 * it's expected that keypaths are relatively short.
 *
 * Example:
 *   set(cacheMap, ['store', 'product', 1], PRODUCT_PAGE_1);
 *   set(cacheMap, ['store', 'product', Fallback], GENERIC_PRODUCT_PAGE);
 *
 *   // Exact match
 *   get(cacheMap, ['store', 'product', 1]) -> PRODUCT_PAGE_1
 *
 *   // Fallback match
 *   get(cacheMap, ['store', 'product', 2]) -> GENERIC_PRODUCT_PAGE
 *
 * Because we have the Fallback mechanism, we can impose a constraint that
 * regular JS maps do not have: a value cannot be stored at multiple keypaths
 * simultaneously. These cases should be expressed with Fallback keys instead.
 *
 * Additionally, because values only exist at a single keypath at a time, we
 * can optimize successive lookups by caching the internal map entry on the
 * value itself, using the `ref` field. This is especially useful because it
 * lets us skip the O(n ^ 2) lookup that occurs when Fallback entries
 * are present.
 *

 * How to decide if stuff belongs in here, or in cache.ts?
 * -------------------------------------------------------
 * 
 * Anything to do with retrival, lifetimes, or eviction needs to go in this
 * module because it affects the fallback algorithm. For example, when
 * performing a lookup, if an entry is stale, it needs to be treated as
 * semantically equivalent to if the entry was not present at all.
 * 
 * If there's logic that's not related to the fallback algorithm, though, we
 * should prefer to put it in cache.ts.
 */

type MapEntryShared<V extends MapValue> = {
  parent: MapEntry<V> | null
  key: any
  map: Map<any, MapEntry<V>> | null

  // LRU-related fields
  prev: MapEntry<any> | null
  next: MapEntry<any> | null
  size: number
}

type EmptyMapEntry<V extends MapValue> = MapEntryShared<V> & {
  value: null
}

type FullMapEntry<V extends MapValue> = MapEntryShared<V> & {
  value: V
}

export type MapEntry<V extends MapValue> = EmptyMapEntry<V> | FullMapEntry<V>

// The CacheMap type is just the root entry of the map.
export type CacheMap<V extends MapValue> = MapEntry<V>

// The protocol that values must implement. In practice, the only two types that
// we ever actually deal with in this module are RouteCacheEntry and
// SegmentCacheEntry; this is just to keep track of the coupling so we don't
// leak concerns between the modules unnecessarily.
export interface MapValue {
  ref: MapEntry<any> | null
  size: number
  staleAt: number
  version: number
}

export type FallbackType = { __brand: 'Fallback' }
export const Fallback = {} as FallbackType

// This is a special internal key that is used for "revalidation" entries. It's
// an implementation detail that shouldn't leak outside of this module.
const Revalidation = {}

export function createCacheMap<V extends MapValue>(): CacheMap<V> {
  const cacheMap: MapEntry<V> = {
    parent: null,
    key: null,
    value: null,
    map: null,

    // LRU-related fields
    prev: null,
    next: null,
    size: 0,
  }
  return cacheMap
}

function getOrInitialize<V extends MapValue>(
  cacheMap: CacheMap<V>,
  keys: VaryPath,
  isRevalidation: boolean
): MapEntry<V> {
  // Go through each level of keys until we find the entry that matches, or
  // create a new entry if one doesn't exist.
  //
  // This function will only return entries that match the keypath _exactly_.
  // Unlike getWithFallback, it will not access fallback entries unless it's
  // explicitly part of the keypath.
  let entry = cacheMap
  let remainingKeys: VaryPath | null = keys
  let key: unknown | null = null
  while (true) {
    const previousKey = key
    if (remainingKeys !== null) {
      key = remainingKeys.value
      remainingKeys = remainingKeys.parent
    } else if (isRevalidation && previousKey !== Revalidation) {
      // During a revalidation, we append an internal "Revalidation" key to
      // the end of the keypath. The "normal" entry is its parent.

      // However, if the parent entry is currently empty, we don't need to store
      // this as a revalidation entry. Just insert the revalidation into the
      // normal slot.
      if (entry.value === null) {
        return entry
      }

      // Otheriwse, create a child entry.
      key = Revalidation
    } else {
      // There are no more keys. This is the terminal entry.
      break
    }

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
      map: null,

      // LRU-related fields
      prev: null,
      next: null,
      size: 0,
    }
    map.set(key, newEntry)
    entry = newEntry
  }

  return entry
}

export function getFromCacheMap<V extends MapValue>(
  now: number,
  currentCacheVersion: number,
  rootEntry: CacheMap<V>,
  keys: VaryPath,
  isRevalidation: boolean
): V | null {
  const entry = getEntryWithFallbackImpl(
    now,
    currentCacheVersion,
    rootEntry,
    keys,
    isRevalidation,
    0
  )
  if (entry === null || entry.value === null) {
    return null
  }
  // This is an LRU access. Move the entry to the front of the list.
  lruPut(entry)
  return entry.value
}

export function isValueExpired<V extends MapValue>(
  now: number,
  currentCacheVersion: number,
  value: V
): boolean {
  return value.staleAt <= now || value.version < currentCacheVersion
}

function lazilyEvictIfNeeded<V extends MapValue>(
  now: number,
  currentCacheVersion: number,
  entry: MapEntry<V>
) {
  // We have a matching entry, but before we can return it, we need to check if
  // it's still fresh. Otherwise it should be treated the same as a cache miss.

  if (entry.value === null) {
    // This entry has no value, so there's nothing to evict.
    return entry
  }

  const value = entry.value
  if (isValueExpired(now, currentCacheVersion, value)) {
    // The value expired. Lazily evict it from the cache, and return null. This
    // is conceptually the same as a cache miss.
    deleteMapEntry(entry)
    return null
  }

  // The matched entry has not expired. Return it.
  return entry
}

function getEntryWithFallbackImpl<V extends MapValue>(
  now: number,
  currentCacheVersion: number,
  entry: MapEntry<V>,
  keys: VaryPath | null,
  isRevalidation: boolean,
  previousKey: unknown | null
): MapEntry<V> | null {
  // This is similar to getExactEntry, but if an exact match is not found for
  // a key, it will return the fallback entry instead. This is recursive at
  // every level, e.g. an entry with keypath [a, Fallback, c, Fallback] is
  // valid match for [a, b, c, d].
  //
  // It will return the most specific match available.
  let key
  let remainingKeys: VaryPath | null
  if (keys !== null) {
    key = keys.value
    remainingKeys = keys.parent
  } else if (isRevalidation && previousKey !== Revalidation) {
    // During a revalidation, we append an internal "Revalidation" key to
    // the end of the keypath.
    key = Revalidation
    remainingKeys = null
  } else {
    // There are no more keys. This is the terminal entry.

    // TODO: When performing a lookup during a navigation, as opposed to a
    // prefetch, we may want to skip entries that are Pending if there's also
    // a Fulfilled fallback entry. Tricky to say, though, since if it's
    // already pending, it's likely to stream in soon. Maybe we could do this
    // just on slow connections and offline mode.

    return lazilyEvictIfNeeded(now, currentCacheVersion, entry)
  }
  const map = entry.map
  if (map !== null) {
    const existingEntry = map.get(key)
    if (existingEntry !== undefined) {
      // Found an exact match for this key. Keep searching.
      const result = getEntryWithFallbackImpl<V>(
        now,
        currentCacheVersion,
        existingEntry,
        remainingKeys,
        isRevalidation,
        key
      )
      if (result !== null) {
        return result
      }
    }
    // No match found for this key. Check if there's a fallback.
    const fallbackEntry = map.get(Fallback)
    if (fallbackEntry !== undefined) {
      // Found a fallback for this key. Keep searching.
      return getEntryWithFallbackImpl(
        now,
        currentCacheVersion,
        fallbackEntry,
        remainingKeys,
        isRevalidation,
        key
      )
    }
  }
  return null
}

export function setInCacheMap<V extends MapValue>(
  cacheMap: CacheMap<V>,
  keys: VaryPath,
  value: V,
  isRevalidation: boolean
): void {
  // Add a value to the map at the given keypath. If the value is already
  // part of the map, it's removed from its previous keypath. (NOTE: This is
  // unlike a regular JS map, but the behavior is intentional.)
  const entry = getOrInitialize(cacheMap, keys, isRevalidation)
  setMapEntryValue(entry, value)

  // This is an LRU access. Move the entry to the front of the list.
  lruPut(entry)
  updateLruSize(entry, value.size)
}

function setMapEntryValue<V extends MapValue>(
  entry: MapEntry<V>,
  value: V
): void {
  if (entry.value !== null) {
    // There's already a value at the given keypath. Disconnect the old value
    // from the map. We're not calling `deleteMapEntry` here because the
    // entry itself is still in the map. We just want to overwrite its value.
    dropRef(entry.value)

    // Fill the entry with the updated value.
    const emptyEntry: EmptyMapEntry<V> = entry as any
    emptyEntry.value = null
    fillEmptyReference(emptyEntry, value)
  } else {
    fillEmptyReference(entry as any, value)
  }
}

function fillEmptyReference<V extends MapValue>(
  entry: EmptyMapEntry<V>,
  value: V
): void {
  // This value may already be in the map at a different keypath.
  // Grab a reference before we overwrite it.
  const oldEntry = value.ref

  const fullEntry: FullMapEntry<V> = entry as any
  fullEntry.value = value
  value.ref = fullEntry

  updateLruSize(fullEntry, value.size)

  if (oldEntry !== null && oldEntry !== entry && oldEntry.value === value) {
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

export function deleteFromCacheMap<V extends MapValue>(value: V): void {
  const entry = value.ref
  if (entry === null) {
    // This value is not a member of any map.
    return
  }

  dropRef(value)
  deleteMapEntry(entry)
}

function dropRef<V extends MapValue>(value: V): void {
  // Drop the value from the map by setting its `ref` backpointer to
  // null. This is a separate operation from `deleteMapEntry` because when
  // re-keying a value we need to be able to delete the old, internal map
  // entry without garbage collecting the value itself.
  value.ref = null
}

export function deleteMapEntry<V extends MapValue>(entry: MapEntry<V>): void {
  // Delete the entry from the cache.
  const emptyEntry: EmptyMapEntry<V> = entry as any
  emptyEntry.value = null

  deleteFromLru(entry)

  // Check if we can garbage collect the entry.
  const map = emptyEntry.map
  if (map === null) {
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
          if (parent.value === null) {
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
  } else {
    // Check if there's a revalidating entry. If so, promote it to a
    // "normal" entry, since the normal one was just deleted.
    const revalidatingEntry = map.get(Revalidation)
    if (revalidatingEntry !== undefined && revalidatingEntry.value !== null) {
      setMapEntryValue(emptyEntry, revalidatingEntry.value)
    }
  }
}

export function setSizeInCacheMap<V extends MapValue>(
  value: V,
  size: number
): void {
  const entry = value.ref
  if (entry === null) {
    // This value is not a member of any map.
    return
  }
  // Except during initialization (when the size is set to 0), this is the only
  // place the `size` field should be updated, to ensure it's in sync with the
  // the LRU.
  value.size = size
  updateLruSize(entry, size)
}
