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
  for (const parent of Object.values(require.cache)) {
    if (parent?.children) {
      for (let i = parent.children.length - 1; i >= 0; i--) {
        if (modsToDelete.has(parent.children[i])) {
          parent.children.splice(i, 1)
        }
      }
    }
  }

  // Phase 3: Clear parent references from children and delete cache entries
  for (const mod of modsToDelete) {
    for (const child of mod.children) {
      child.parent = null
    }
  }

  for (const filePath of resolvedPaths) {
    delete require.cache[filePath]
  }
}

export function deleteCache(filePaths: string[]) {
  for (const filePath of filePaths) {
    clearManifestCache(filePath)
  }
  deleteFromRequireCache(filePaths)
}
