import type Watchpack from 'next/dist/compiled/watchpack'

interface InternalDirectoryWatcher {
  initialScan?: boolean
  closed?: boolean
  directories?: Map<string, InternalWatcherHandle | true>
}

interface InternalWatcherHandle {
  directoryWatcher?: InternalDirectoryWatcher
}

// Watchpack has no public signal for when the asynchronous initial scan has
// finished, but each internal DirectoryWatcher flips `initialScan` to false
// once its directory level is scanned (including on scan errors), and nested
// watchers are created while the parent's flag is still true — so no reachable
// watcher pending means the whole tree has been scanned. Reading internals is
// deliberately defensive: an unexpected shape counts as "not pending".
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
