import type { DeepReadonly } from '../shared/lib/deep-readonly'

import { join } from 'path'
import { readFileSync } from 'fs'
import { createContext, runInContext, Script, type Context } from 'vm'
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
  shouldCache?: boolean,
  cache?: Map<string, unknown>,
  skipParse?: boolean,
  handleMissing?: boolean
): DeepReadonly<T | undefined>
export function loadManifest<T extends object>(
  path: string,
  shouldCache: boolean = true,
  cache = sharedCache,
  skipParse = false,
  handleMissing?: boolean
): T | undefined {
  if (shouldCache && cache.has(path)) {
    return cache.get(path) as T
  }

  let manifest: any

  if (handleMissing) {
    try {
      manifest = readFileSync(/* turbopackIgnore: true */ path, 'utf8')
    } catch (err) {
      let result = undefined
      cache.set(path, result)
      return result
    }
  } else {
    manifest = readFileSync(/* turbopackIgnore: true */ path, 'utf8')
  }

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
  shouldCache?: true,
  cache?: Map<string, unknown>
): DeepReadonly<T>
export function evalManifest<T extends object>(
  path: string,
  shouldCache?: boolean,
  cache?: Map<string, unknown>,
  handleMissing?: boolean
): DeepReadonly<T | undefined>
export function evalManifest<T extends object>(
  path: string,
  shouldCache: boolean = true,
  cache = sharedCache,
  handleMissing?: boolean
): T | undefined {
  if (shouldCache && cache.has(path)) {
    return cache.get(path) as T
  }

  let content: any
  if (handleMissing) {
    try {
      content = readFileSync(/* turbopackIgnore: true */ path, 'utf8')
    } catch (err) {
      let result = undefined
      cache.set(path, result)
      return result
    }
  } else {
    content = readFileSync(/* turbopackIgnore: true */ path, 'utf8')
  }

  if (content.length === 0) {
    throw new Error('Manifest file is empty')
  }

  let contextObject = evalInSharedContext(content, {
    env: { NEXT_DEPLOYMENT_ID: process.env.NEXT_DEPLOYMENT_ID },
  })

  // Freeze the result so it cannot be modified if we're caching it.
  if (shouldCache) {
    contextObject = deepFreeze(contextObject)
  }

  if (shouldCache) {
    cache.set(path, contextObject)
  }

  return contextObject as T
}

/**
 * The vm context that manifests are evaluated in. It is created lazily and
 * reused for every manifest: a context per manifest costs ~0.45 ms to create
 * and, since evaluated manifests are cached, keeps ~0.16 MiB of heap alive per
 * manifest.
 *
 * Manifests are trusted build output and vm contexts are not a security
 * boundary. Reusing the context means manifests share one global object and one
 * set of intrinsics. The transient globals they define (`__RSC_MANIFEST`) are
 * moved out after each evaluation, but other state, such as top-level
 * `var`/`let`/`const` declarations or modified built-ins, would carry over to
 * the next manifest. The manifests Turbopack and webpack emit don't do that.
 */
let manifestContext:
  | { context: Context; takeGlobals: () => Record<string, unknown> }
  | undefined

/**
 * Runs inside a new manifest context and returns the function that moves the
 * enumerable own global properties a manifest defined into a new object and
 * deletes them from the global, so they don't leak into the next manifest.
 * Globals present when the context was created are kept (Node flags such as
 * `--expose-gc` add some), as is `process`. This is not a full reset (see
 * `manifestContext`). Properties created by a script on the context's global
 * can't reliably be listed or deleted through the host-side sandbox object, so
 * this has to run in the context. Throws if a property can't be deleted.
 */
const createTakeManifestGlobals = new Script(
  `(() => {
  const initial = new Set(Object.keys(globalThis));
  initial.add('process');
  return function takeManifestGlobals() {
    const globals = {};
    for (const key of Object.keys(globalThis)) {
      if (initial.has(key)) continue;
      globals[key] = globalThis[key];
      if (!delete globalThis[key]) {
        throw new Error('Manifest defined a global that cannot be removed: ' + key);
      }
    }
    if (Object.keys(globalThis).some((key) => !initial.has(key))) {
      throw new Error('Manifest left globals behind');
    }
    return globals;
  };
})()`
)

function getManifestContext() {
  if (!manifestContext) {
    const context = createContext({})
    const takeGlobals = createTakeManifestGlobals.runInContext(context)
    manifestContext = { context, takeGlobals }
  }
  return manifestContext
}

function evalInSharedContext(
  content: string,
  processObject: object
): Record<string, unknown> {
  const { context, takeGlobals } = getManifestContext()
  context.process = processObject
  try {
    runInContext(content, context)
  } catch (err) {
    // Remove what the failed manifest defined, then discard the context: it
    // may hold other state from the failed evaluation.
    try {
      takeGlobals()
    } catch {}
    manifestContext = undefined
    throw err
  }
  try {
    return takeGlobals()
  } catch (err) {
    // A global couldn't be removed. Never return a result from a context in
    // that state; discard it, so the next manifest gets a fresh one.
    manifestContext = undefined
    throw err
  }
}

export function evalManifestFromRelativePath<T extends object>({
  projectDir,
  distDir,
  manifest,
  shouldCache,
  cache,
  handleMissing,
}: {
  projectDir: string
  distDir: string
  manifest: string
  shouldCache: boolean
  cache?: Map<string, unknown>
  skipParse?: boolean
  handleMissing?: boolean
}): DeepReadonly<T | undefined> {
  const manifestPath = join(
    /* turbopackIgnore: true */ projectDir,
    distDir,
    manifest
  )
  return evalManifest<T>(manifestPath, shouldCache, cache, handleMissing)
}

export function loadManifestFromRelativePath<T extends object>({
  projectDir,
  distDir,
  manifest,
  shouldCache,
  cache,
  skipParse,
  handleMissing,
}: {
  projectDir: string
  distDir: string
  manifest: string
  shouldCache: boolean
  cache?: Map<string, unknown>
  skipParse?: boolean
  handleMissing?: false | undefined
}): DeepReadonly<T>
export function loadManifestFromRelativePath<T extends object>({
  projectDir,
  distDir,
  manifest,
  shouldCache,
  cache,
  skipParse,
  handleMissing,
}: {
  projectDir: string
  distDir: string
  manifest: string
  shouldCache: boolean
  cache?: Map<string, unknown>
  skipParse?: boolean
  handleMissing: true
}): DeepReadonly<T | undefined>
export function loadManifestFromRelativePath<T extends object>({
  projectDir,
  distDir,
  manifest,
  shouldCache,
  cache,
  skipParse,
  handleMissing,
}: {
  projectDir: string
  distDir: string
  manifest: string
  shouldCache: boolean
  cache?: Map<string, unknown>
  skipParse?: boolean
  handleMissing?: boolean
}): DeepReadonly<T | undefined> {
  const manifestPath = join(
    /* turbopackIgnore: true */ projectDir,
    distDir,
    manifest
  )
  return loadManifest<T>(
    manifestPath,
    shouldCache,
    cache,
    skipParse,
    handleMissing
  )
}

export function clearManifestCache(path: string, cache = sharedCache): boolean {
  return cache.delete(path)
}
