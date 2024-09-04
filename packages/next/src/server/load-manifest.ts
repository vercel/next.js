import type { DeepReadonly } from '../shared/lib/deep-readonly'

import { readFileSync } from 'fs'
import { runInNewContext } from 'vm'
import { deepFreeze } from '../shared/lib/deep-freeze'

const sharedCache = new Map<string, unknown>()

/**
 * Load a manifest file from the file system. Optionally cache the manifest in
 * memory to avoid reading the file multiple times using the provided cache or
 * defaulting to a shared module cache. The manifest is frozen to prevent
 * modifications if it is cached.
 *
 * @param path the path to the manifest file
 * @param shouldCache whether to cache the manifest in memory
 * @param cache the cache to use for storing the manifest
 * @returns the manifest object
 */
export function loadManifest<T extends object>(
  path: string,
  shouldCache: false
): T
export function loadManifest<T extends object>(
  path: string,
  shouldCache?: boolean,
  cache?: Map<string, unknown>
): DeepReadonly<T>
export function loadManifest<T extends object>(
  path: string,
  shouldCache?: true,
  cache?: Map<string, unknown>
): DeepReadonly<T>
export function loadManifest<T extends object>(
  path: string,
  shouldCache: boolean = true,
  cache = sharedCache
): T {
  const cached = shouldCache && cache.get(path)
  if (cached) {
    return cached as T
  }

  let manifest = JSON.parse(readFileSync(path, 'utf8'))

  // Freeze the manifest so it cannot be modified if we're caching it.
  if (shouldCache) {
    manifest = deepFreeze(manifest)
  }

  if (shouldCache) {
    cache.set(path, manifest)
  }

  return manifest
}

export function evalManifest<T extends object>(
  path: string,
  shouldCache: false
): T
export function evalManifest<T extends object>(
  path: string,
  shouldCache?: boolean,
  cache?: Map<string, unknown>
): DeepReadonly<T>
export function evalManifest<T extends object>(
  path: string,
  shouldCache?: true,
  cache?: Map<string, unknown>
): DeepReadonly<T>
export function evalManifest<T extends object>(
  path: string,
  shouldCache: boolean = true,
  cache = sharedCache
): T {
  const cached = shouldCache && cache.get(path)
  if (cached) {
    return cached as T
  }

  const content = readFileSync(path, 'utf8')
  if (content.length === 0) {
    throw new Error('Manifest file is empty')
  }

  let contextObject = {}
  runInNewContext(content, contextObject)

  // Freeze the context object so it cannot be modified if we're caching it.
  if (shouldCache) {
    contextObject = deepFreeze(contextObject)
  }

  if (shouldCache) {
    cache.set(path, contextObject)
  }

  return contextObject as T
}

export function clearManifestCache(path: string, cache = sharedCache): boolean {
  return cache.delete(path)
}
