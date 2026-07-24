import type Watchpack from 'next/dist/compiled/watchpack'

/**
 * Watchpack's initial directory scan runs asynchronously after `watch()`.
 * When watching with a `startTime` in the past (e.g. `startTime: 0`), the
 * scan emits one change event per pre-existing file, and the `aggregated`
 * event fires `aggregateTimeout` ms after the *last* change event. That means
 * `aggregated` can fire while the initial scan is still in flight (any event
 * lull longer than `aggregateTimeout` mid-scan triggers it), in which case
 * `getTimeInfoEntries()` is missing part of the watched tree.
 *
 * Watchpack has no public signal for scan completion, but every internal
 * `DirectoryWatcher` carries an `initialScan` flag that flips to `false` once
 * its first scan of that directory level finishes (including on scan errors).
 * Nested directories get their own `DirectoryWatcher`, created by the parent
 * while the parent's flag is still `true`. Therefore "no reachable watcher
 * has `initialScan === true`" implies the whole watched tree has been
 * scanned.
 *
 * The traversal below reads watchpack internals, so it is deliberately
 * defensive: anything with an unexpected shape is treated as "not pending",
 * which degrades to the previous behavior instead of blocking the watcher.
 */

interface InternalDirectoryWatcher {
  initialScan?: boolean
  closed?: boolean
  directories?: Map<string, InternalWatcherHandle | true>
}

interface InternalWatcherHandle {
  directoryWatcher?: InternalDirectoryWatcher
}

export function hasPendingInitialScan(watchpack: Watchpack): boolean {
  const wp = watchpack as any
  const queue: InternalDirectoryWatcher[] = []

  for (const watchers of [wp.fileWatchers, wp.directoryWatchers]) {
    if (typeof watchers?.values !== 'function') {
      continue
    }
    for (const watcher of watchers.values()) {
      const directoryWatcher = watcher?.watcher?.directoryWatcher
      if (directoryWatcher) {
        queue.push(directoryWatcher)
      }
    }
  }

  const visited = new Set<InternalDirectoryWatcher>()
  while (queue.length > 0) {
    const directoryWatcher = queue.pop()!
    if (visited.has(directoryWatcher) || directoryWatcher.closed) {
      continue
    }
    visited.add(directoryWatcher)
    if (directoryWatcher.initialScan) {
      return true
    }
    const directories = directoryWatcher.directories
    if (typeof directories?.values !== 'function') {
      continue
    }
    for (const nested of directories.values()) {
      const nestedDirectoryWatcher = (nested as InternalWatcherHandle)
        ?.directoryWatcher
      if (nestedDirectoryWatcher) {
        queue.push(nestedDirectoryWatcher)
      }
    }
  }

  return false
}

export async function waitForInitialScan(watchpack: Watchpack): Promise<void> {
  while (hasPendingInitialScan(watchpack)) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
  }
}
