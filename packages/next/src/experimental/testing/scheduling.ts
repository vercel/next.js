import type { DiscoveredTestProject } from './discovery'
import { join } from 'path'

/** Keep a public invocation exclusive across compiler/server handoffs and modes. */
export async function acquireTestRunLock(projectDir: string) {
  const { loadBindings } = await import('../../build/swc/index.js')
  const { Lockfile } = await import('../../build/lockfile.js')
  const bindings = await loadBindings()
  if (bindings.isWasm)
    throw new Error('Test scheduling requires native process ownership.')
  const lock = Lockfile.tryAcquire(join(projectDir, '.next-test-run.lock'))
  if (!lock) {
    throw new Error(
      'Another next test invocation owns this application. Run concurrent CI shards in separate checkouts with separate output directories.'
    )
  }
  return lock
}

export interface TestShard {
  index: number
  count: number
}

export function parseMaxWorkers(value: unknown): number {
  const workers =
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
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

/** Sort stable profile/path identities after filtering, independent of config order. */
export function shardTestProjects(
  projects: DiscoveredTestProject[],
  shard: TestShard
): DiscoveredTestProject[] {
  const ids = projects
    .flatMap((project) => project.entries.map((entry) => entry.id))
    .sort()
  const selected = new Set(
    ids.filter((_, index) => index % shard.count === shard.index - 1)
  )
  return projects.map((project) => ({
    ...project,
    entries: project.entries.filter((entry) => selected.has(entry.id)),
  }))
}

/** Bound the complete file lease, including acquisition and awaited cleanup. */
export async function forEachTestFile<T>(
  files: readonly T[],
  maxWorkers: number,
  signal: AbortSignal,
  run: (file: T) => Promise<void>
): Promise<void> {
  let next = 0
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(maxWorkers, files.length) }, async () => {
      while (!signal.aborted && next < files.length) {
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
