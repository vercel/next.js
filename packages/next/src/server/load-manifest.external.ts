import type { DeepReadonly } from '../shared/lib/deep-readonly'

import { join } from 'path'
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
  cache?: Map<string, unknown>,
  skipParse?: boolean
): DeepReadonly<T>
export function loadManifest<T extends object>(
  path: string,
  shouldCache?: true,
  cache?: Map<string, unknown>,
  skipParse?: boolean
): DeepReadonly<T>
export function loadManifest<T extends object>(
  path: string,
  shouldCache: boolean = true,
  cache = sharedCache,
  skipParse = false
): T {
  const cached = shouldCache && cache.get(path)
  if (cached) {
    return cached as T
  }

  let manifest: any = readFileSync(/* turbopackIgnore: true */ path, 'utf8')

  if (!skipParse) {
    manifest = JSON.parse(manifest)

    // Freeze the manifest so it cannot be modified if we're caching it.
    if (shouldCache) {
      manifest = deepFreeze(manifest)
    }
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

  const content = readFileSync(/* turbopackIgnore: true */ path, 'utf8')
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

export function loadManifestFromRelativePath<T extends object>({
  projectDir,
  distDir,
  manifest,
  shouldCache,
  cache,
  skipParse,
  handleMissing,
  useEval,
}: {
  projectDir: string
  distDir: string
  manifest: string
  shouldCache?: boolean
  cache?: Map<string, unknown>
  skipParse?: boolean
  handleMissing?: boolean
  useEval?: boolean
}): DeepReadonly<T> {
  try {
    const manifestPath = join(
      /* turbopackIgnore: true */ projectDir,
      distDir,
      manifest
    )

    if (useEval) {
      return evalManifest<T>(manifestPath, shouldCache, cache)
    }
    return loadManifest<T>(manifestPath, shouldCache, cache, skipParse)
  } catch (err) {
    if (handleMissing) {
      // TODO: should this be undefined
      return {} as DeepReadonly<T>
    }
    throw err
  }
}

export function clearManifestCache(path: string, cache = sharedCache): boolean {
  return cache.delete(path)
}
