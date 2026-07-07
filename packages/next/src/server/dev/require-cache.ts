import isError from '../../lib/is-error'
import { realpathSync } from '../../lib/realpath'
import { clearManifestCache } from '../load-manifest.external'

/**
 * Batch delete modules from require.cache with a single scan.
 *
 * When deleting N modules, this performs ONE scan of require.cache
 * instead of N scans, reducing complexity from O(N * C) to O(C + N)
 * where C = size of require.cache.
 */
function deleteFromRequireCache(filePaths: string[]): void {
  // Phase 1: Resolve all paths and collect modules to delete
  const resolvedPaths: string[] = []
  const modsToDelete = new Set<NodeModule>()

  for (let filePath of filePaths) {
    try {
      filePath = realpathSync(filePath)
    } catch (e) {
      if (isError(e) && e.code !== 'ENOENT') throw e
    }
    const mod = require.cache[filePath]
    if (mod) {
      resolvedPaths.push(filePath)
      modsToDelete.add(mod)
    }
  }

  if (modsToDelete.size === 0) return

  // Phase 2: Single scan of require.cache to remove child references
  const modules = Object.values(require.cache)
  for (let m = 0; m < modules.length; m++) {
    const children = modules[m]?.children
    if (children && children.length) {
      let len = children.length
      for (let i = 0; i < len; i++) {
        if (modsToDelete.has(children[i])) {
          children[i] = children[--len]
          i-- // re-check swapped element
        }
      }
      children.length = len
    }
  }

  // Phase 3: Clear parent references from children and delete cache entries
  for (const mod of modsToDelete) {
    const children = mod.children
    for (let i = 0; i < children.length; i++) {
      if (children[i].parent === mod) {
        children[i].parent = null
      }
    }
  }

  for (const filePath of resolvedPaths) {
    delete require.cache[filePath]
  }
}

// Listeners notified after the dev server's main-process require/manifest
// caches are cleared. Worker pools that hold their own cached state —
// distinct from the main process's — subscribe here so they can invalidate
// in response to the same HMR events.
const cacheInvalidationListeners = new Set<(filePaths: string[]) => void>()

export function onCacheInvalidation(
  listener: (filePaths: string[]) => void
): () => void {
  cacheInvalidationListeners.add(listener)
  return () => {
    cacheInvalidationListeners.delete(listener)
  }
}

export function deleteCache(filePaths: string[]) {
  for (const filePath of filePaths) {
    clearManifestCache(filePath)
  }
  deleteFromRequireCache(filePaths)
  for (const listener of cacheInvalidationListeners) {
    try {
      listener(filePaths)
    } catch {
      // Listener errors must not interfere with cache cleanup.
    }
  }
}
