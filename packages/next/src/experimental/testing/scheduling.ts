import type { TestResultCache } from './result-cache'
import type { DiscoveredTestProject } from './discovery'
import { posix } from 'path'
import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
import { shuffleFiles } from './runner/sequence'
import { getTestRunLockPath } from './run-lock'

/** Keep a public invocation exclusive across compiler/server handoffs and modes. */
export async function acquireTestRunLock(
  projectDir: string,
  options: { recoverSnapshots?: boolean } = {}
) {
  const { loadBindings } = await import('../../build/swc/index.js')
  const { Lockfile } = await import('../../build/lockfile.js')
  const bindings = await loadBindings()
  if (bindings.isWasm)
    throw new Error('Test scheduling requires native process ownership.')
  const lock = Lockfile.tryAcquire(getTestRunLockPath(projectDir))
  if (!lock) {
    throw new Error(
      'Another next test invocation owns this application. Run concurrent CI shards in separate checkouts with separate output directories.'
    )
  }
  try {
    if (options.recoverSnapshots !== false) {
      const { recoverSnapshotUpdates } = await import(
        './assertions/snapshots.js'
      )
      await recoverSnapshotUpdates(projectDir)
    }
    return lock
  } catch (error) {
    await lock.unlock()
    throw error
  }
}

export interface TestShard {
  index: number
  count: number
}

export function parseMaxWorkers(value: unknown): number {
  let workers =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    const count = availableParallelism()
    workers = Math.max(
      1,
      Math.min(count, Math.round((Number.parseInt(value) / 100) * count))
    )
  }
  if (
    typeof workers !== 'number' ||
    !Number.isSafeInteger(workers) ||
    workers < 1 ||
    workers > 64
  ) {
    throw new Error('maxWorkers must be an integer between 1 and 64.')
  }
  return workers
}

export function parseTestShard(value: string): TestShard {
  const match = /^(\d+)\/(\d+)$/.exec(value)
  const index = Number(match?.[1])
  const count = Number(match?.[2])
  if (
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(count) ||
    index < 1 ||
    count < 1 ||
    index > count
  ) {
    throw new Error(
      '--shard must be INDEX/COUNT with 1 <= INDEX <= COUNT (safe integers).'
    )
  }
  return { index, count }
}

/**
 * Match the pinned fresh-run sequencer: stable physical-path hash partitions,
 * then project-name/file-size ordering. The caller supplies its canonical root.
 * Equal hashes preserve input order, including one source in multiple projects.
 */
export async function shardTestProjects(
  projects: DiscoveredTestProject[],
  shard: TestShard,
  projectDir: string,
  options: { sortFiles?: false } = {}
): Promise<DiscoveredTestProject[]> {
  const root = projectDir.replace(/\\/g, '/')
  const files = projects.flatMap((project, projectIndex) =>
    project.entries.map((entry) => {
      const file = entry.file.replace(/\\/g, '/')
      // The pinned path resolver recognizes canonical Windows drives even on
      // another platform, normalizes their casing, and emits forward slashes.
      const resolved = /^[A-Za-z]:\//.test(file)
        ? `${file[0].toUpperCase()}:${posix.resolve('/', file.slice(2))}`
        : posix.resolve(root, file)
      return {
        projectIndex,
        entry,
        hash: createHash('sha1')
          .update(resolved.slice(root.length))
          .digest('hex'),
      }
    })
  )
  const baseSize = Math.floor(files.length / shard.count)
  const remainder = files.length % shard.count
  const start =
    baseSize * (shard.index - 1) + Math.min(shard.index - 1, remainder)
  const end = start + baseSize + (shard.index <= remainder ? 1 : 0)
  const selected = files
    .sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0))
    .slice(start, end)
  const sizes = new Map<string, number>()
  await Promise.all(
    (options.sortFiles === false
      ? []
      : [...new Set(selected.map(({ entry }) => entry.file))]
    ).map(async (file) => {
      try {
        sizes.set(file, (await stat(file)).size)
      } catch {
        // As in the pinned sequencer, a missing size is scheduled first; its
        // ordinary compiler/collection diagnostic must remain visible.
      }
    })
  )
  return projects
    .map((project, projectIndex) => ({
      ...project,
      entries: selected
        .filter((file) => file.projectIndex === projectIndex)
        .map(({ entry }) => entry)
        .sort((a, b) => {
          if (options.sortFiles === false) return 0
          const aSize = sizes.get(a.file)
          const bSize = sizes.get(b.file)
          if (aSize === undefined || bSize === undefined)
            return aSize === undefined && bSize !== undefined
              ? -1
              : bSize === undefined && aSize !== undefined
                ? 1
                : 0
          return bSize - aSize
        }),
    }))
    .sort((a, b) =>
      a.profile.id < b.profile.id ? -1 : a.profile.id > b.profile.id ? 1 : 0
    )
}

/** Actual uncached file order; discovery/specification order remains caller-owned. */
export async function sortUncachedTestProjects(
  projects: DiscoveredTestProject[]
): Promise<DiscoveredTestProject[]> {
  const sizes = new Map<string, number>()
  await Promise.all(
    [
      ...new Set(
        projects
          .filter((project) => !shuffleFiles(project.sequence?.shuffle))
          .flatMap((project) => project.entries.map((entry) => entry.file))
      ),
    ].map(async (file) => {
      try {
        sizes.set(file, (await stat(file)).size)
      } catch {
        // An unknown file runs first and retains its ordinary compiler failure.
      }
    })
  )
  return projects.map((project) =>
    shuffleFiles(project.sequence?.shuffle)
      ? project
      : {
          ...project,
          entries: [...project.entries].sort((a, b) => {
            const aSize = sizes.get(a.file)
            const bSize = sizes.get(b.file)
            if (aSize === undefined || bSize === undefined)
              return aSize === undefined && bSize !== undefined
                ? -1
                : bSize === undefined && aSize !== undefined
                  ? 1
                  : 0
            return bSize - aSize
          }),
        }
  )
}

/** Bound the complete file lease, including acquisition and awaited cleanup. */
export async function forEachTestFile<T>(
  files: readonly T[],
  maxWorkers: number,
  signal: AbortSignal,
  run: (file: T) => Promise<void>,
  shouldStop?: () => boolean
): Promise<void> {
  let next = 0
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(maxWorkers, files.length) }, async () => {
      while (!signal.aborted && !shouldStop?.() && next < files.length) {
        const file = files[next++]
        await run(file)
      }
    })
  )
  // Never release the compiler's artifacts while another lane is still reading.
  const failures = results.filter((result) => result.status === 'rejected')
  if (failures.length) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      'Test file scheduling failed.'
    )
  }
}

/** Actual result history changes ordering only; every selected file still runs. */
export async function sortCachedTestProjects(
  projects: DiscoveredTestProject[],
  cache: TestResultCache
): Promise<DiscoveredTestProject[]> {
  const sizes = new Map<string, number>()
  await Promise.all(
    [
      ...new Set(
        projects.flatMap((project) =>
          project.entries.map((entry) => entry.file)
        )
      ),
    ].map(async (file) => {
      try {
        sizes.set(file, (await stat(file)).size)
      } catch {
        /* Existing compiler failure remains authoritative. */
      }
    })
  )
  return projects.map((project) => ({
    ...project,
    entries: [...project.entries].sort((a, b) => {
      const aResult = cache.get(project.displayName ?? '', a.file)
      const bResult = cache.get(project.displayName ?? '', b.file)
      if (!aResult || !bResult) {
        const aSize = sizes.get(a.file),
          bSize = sizes.get(b.file)
        if (aSize === undefined || bSize === undefined)
          return aSize === undefined && bSize !== undefined
            ? -1
            : bSize === undefined && aSize !== undefined
              ? 1
              : 0
        return bSize - aSize
      }
      if (aResult.failed && !bResult.failed) return -1
      if (!aResult.failed && bResult.failed) return 1
      return bResult.duration - aResult.duration
    }),
  }))
}
