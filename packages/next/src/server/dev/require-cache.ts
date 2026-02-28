import { statSync } from 'fs'
import isError from '../../lib/is-error'
import { realpathSync } from '../../lib/realpath'
import { clearManifestCache } from '../load-manifest.external'
import Watchpack from 'next/dist/compiled/watchpack'

function deleteFromRequireCache(filePath: string) {
  try {
    filePath = realpathSync(filePath)
  } catch (e) {
    if (isError(e) && e.code !== 'ENOENT') throw e
  }
  const mod = require.cache[filePath]
  if (mod) {
    // remove the child reference from all parent modules
    for (const parent of Object.values(require.cache)) {
      if (parent?.children) {
        const idx = parent.children.indexOf(mod)
        if (idx >= 0) parent.children.splice(idx, 1)
      }
    }
    // remove parent references from external modules
    for (const child of mod.children) {
      child.parent = null
    }
    delete require.cache[filePath]
    return true
  }
  return false
}

export function deleteCache(filePath: string) {
  // try to clear it from the fs cache
  clearManifestCache(filePath)

  deleteFromRequireCache(filePath)
}

/**
 * Watches external (non-distDir) modules that are loaded as children of
 * Turbopack output chunks, evicting them from require.cache when they change.
 *
 * Turbopack doesn't watch node_modules, so changes to serverExternalPackages
 * modules never trigger a recompile. This watcher fills that gap: after each
 * chunk write we scan distDir chunks for non-distDir children (externals) and
 * start watching any we haven't seen before. When a watched file changes on
 * disk we immediately evict it from require.cache so the next request picks up
 * the fresh version.
 *
 * Evicting the external alone is not enough: Turbopack's devModuleCache (a
 * closure variable in [turbopack]_runtime.js) caches instantiated modules and
 * is not cleared by clearChunkCache(). To force re-instantiation we also evict
 * the runtime chunk and all page chunks that reference it. This causes the
 * runtime to be re-required on the next request with a fresh devModuleCache,
 * so page modules are re-instantiated and pick up the new external.
 *
 * We evict ONLY the runtime chunk itself (not its children) to avoid evicting
 * async storage externals (work-async-storage.external.js etc.) which are
 * children of the runtime's SSR chunks and must remain in require.cache.
 */
export class ExternalWatcher {
  // Watchpack handles fs.watch lifecycle, error recovery, and platform quirks.
  private wp = new Watchpack({ aggregateTimeout: 200 })
  private watched = new Set<string>()

  /**
   * Called whenever an external module is evicted from require.cache due to a
   * detected change. The hot reloader uses this to also clear Turbopack's chunk
   * cache so the runtime chunk re-executes and picks up the fresh external.
   */
  onExternalChanged: (() => void) | undefined

  constructor(private distDir: string) {
    this.wp.on('aggregated', (changes: Set<string>) => {
      for (const filePath of changes) {
        if (this.watched.has(filePath)) {
          this.evictExternal(filePath)
        }
      }
    })
  }

  /**
   * Scan all currently-loaded distDir chunks for non-distDir children.
   * Newly-discovered externals are added to the Watchpack watch list.
   * Already-watched externals are checked for mtime changes that occurred
   * before the watcher fired (stale-at-discovery race).
   */
  scan() {
    const newFiles: string[] = []
    for (const [filePath, mod] of Object.entries(require.cache)) {
      if (!filePath.startsWith(this.distDir) || !mod) continue
      for (const child of mod.children) {
        if (child.filename.startsWith(this.distDir)) continue
        if (this.watched.has(child.filename)) continue
        this.watched.add(child.filename)
        newFiles.push(child.filename)
      }
    }
    if (newFiles.length === 0) return
    // Re-watch with the updated file list. Watchpack diffs internally so
    // existing watchers are preserved; only new files get new watchers.
    // startTime: Date.now() means only future changes fire the aggregated event.
    this.wp.watch({ files: [...this.watched], startTime: Date.now() })
    // Stale-at-discovery check: if a file was modified after the distDir chunk
    // that loaded it was written (i.e. between first render and this scan),
    // Watchpack won't fire for it. Evict it immediately.
    for (const filePath of newFiles) {
      const mod = require.cache[filePath]
      if (!mod) continue
      const parentMod = Object.values(require.cache).find(
        (m) => m?.filename.startsWith(this.distDir) && m.children.includes(mod)
      )
      if (!parentMod) continue
      try {
        const extStat = statSync(filePath, { throwIfNoEntry: false })
        const parentStat = statSync(parentMod.filename, {
          throwIfNoEntry: false,
        })
        if (extStat && parentStat && extStat.mtimeMs > parentStat.mtimeMs) {
          this.evictExternal(filePath)
        }
      } catch {
        // Ignore stat errors.
      }
    }
  }

  private evictExternal(filePath: string) {
    // Evict the external itself.
    deleteFromRequireCache(filePath)

    // Find the Turbopack runtime chunk directly by filename pattern — it's the
    // single distDir chunk whose name contains "[turbopack]_runtime". Evicting
    // it (but NOT its children) forces a fresh devModuleCache on the next
    // request. The runtime's children (SSR chunks + async storage externals)
    // remain in require.cache so in-flight requests keep their storage context.
    // Pass 1: find the Turbopack runtime chunk by filename pattern.
    let runtimeChunk: NodeJS.Module | undefined
    for (const [path, mod] of Object.entries(require.cache)) {
      if (
        mod &&
        path.startsWith(this.distDir) &&
        path.includes('[turbopack]_runtime')
      ) {
        runtimeChunk = mod
        break
      }
    }
    // Pass 2: find all page chunks that have the runtime as a direct child.
    const pageChunks: NodeJS.Module[] = []
    if (runtimeChunk) {
      for (const [path, mod] of Object.entries(require.cache)) {
        if (
          mod &&
          path.startsWith(this.distDir) &&
          mod.children.includes(runtimeChunk)
        ) {
          pageChunks.push(mod)
        }
      }
    }

    if (runtimeChunk) deleteFromRequireCache(runtimeChunk.filename)
    for (const pageChunk of pageChunks) {
      deleteFromRequireCache(pageChunk.filename)
    }

    this.onExternalChanged?.()
  }

  dispose() {
    this.wp.close()
    this.watched.clear()
  }
}
