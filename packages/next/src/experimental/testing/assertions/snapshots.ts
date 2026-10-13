import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import type { SnapshotStateOptions } from '../../../compiled/next-test-primitives'

export type SnapshotUpdateMode = 'none' | 'new' | 'all'

export function resolveSnapshotUpdateMode(options: {
  updateSnapshots?: boolean
  snapshotUpdateMode?: SnapshotUpdateMode
}): SnapshotUpdateMode {
  const mode =
    options.snapshotUpdateMode ?? (options.updateSnapshots ? 'all' : 'none')
  if (mode !== 'none' && mode !== 'new' && mode !== 'all')
    throw new TypeError('Invalid snapshot update mode.')
  return mode
}

/** Bytes cross IPC; executable snapshot environments never do. */
export interface SnapshotUpdate {
  path: string
  /** Null deletes the managed external snapshot file after parent authorization. */
  content: string | null
  previousContent: string | null
}

export interface SnapshotUpdatePlan {
  file: string
  sourceHash?: string
  updates: readonly SnapshotUpdate[]
}

/** Validate overlapping profile plans before any of the parent-owned writes. */
export function combineSnapshotUpdatePlans(
  plans: Iterable<SnapshotUpdatePlan>
): SnapshotUpdatePlan[] {
  const combined = new Map<
    string,
    { plan: SnapshotUpdatePlan; paths: Map<string, SnapshotUpdate> }
  >()
  const owners = new Map<string, string>()
  for (const plan of plans) {
    if (!plan.updates.length) continue
    let entry = combined.get(plan.file)
    if (entry && entry.plan.sourceHash !== plan.sourceHash)
      throw new Error('Conflicting source revisions in snapshot update plans.')
    if (!entry) {
      entry = { plan, paths: new Map() }
      combined.set(plan.file, entry)
    }
    for (const update of plan.updates) {
      const owner = owners.get(update.path)
      if (owner && owner !== plan.file)
        throw new Error(
          'Different test files cannot publish the same snapshot path.'
        )
      owners.set(update.path, plan.file)
      const previous = entry.paths.get(update.path)
      if (
        previous &&
        (previous.content !== update.content ||
          previous.previousContent !== update.previousContent)
      )
        throw new Error(
          `Conflicting snapshot update plans for ${plan.file}. Select one project or use distinct snapshot paths.`
        )
      entry.paths.set(update.path, update)
    }
  }
  return [...combined.values()].map(({ plan, paths }) => ({
    ...plan,
    updates: [...paths.values()],
  }))
}

export function stageSnapshotUpdates(
  environment: SnapshotStateOptions['snapshotEnvironment'],
  enabled: boolean
): {
  environment: SnapshotStateOptions['snapshotEnvironment']
  take(): SnapshotUpdate[]
} {
  const previous = new Map<string, string | null>()
  const updates = new Map<string, SnapshotUpdate>()
  return {
    environment: new Proxy(environment, {
      get(target, property) {
        if (property === 'readSnapshotFile') {
          return async (path: string) => {
            const content = await target.readSnapshotFile(path)
            // The primitive rereads while saving. Only its initial read is the
            // version our generated snapshot content was based on.
            if (!previous.has(path)) previous.set(path, content)
            return content
          }
        }
        if (property === 'saveSnapshotFile') {
          return async (path: string, content: string) => {
            if (!enabled) return
            if (!previous.has(path))
              throw new Error(
                'Snapshot update requires its original file bytes.'
              )
            if (content !== previous.get(path)) {
              updates.set(path, {
                path,
                content,
                previousContent: previous.get(path)!,
              })
            }
          }
        }
        if (property === 'removeSnapshotFile') {
          return async (path: string) => {
            if (!enabled) return
            if (!previous.has(path))
              throw new Error(
                'Snapshot deletion requires its original file bytes.'
              )
            const previousContent = previous.get(path)!
            if (previousContent !== null)
              updates.set(path, { path, content: null, previousContent })
          }
        }
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }),
    take() {
      const result = [...updates.values()]
      updates.clear()
      return result
    },
  }
}

async function read(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** Called by the execution parent only after successful exit and cleanup. */
export async function commitSnapshotUpdates(
  testPath: string,
  updates: readonly SnapshotUpdate[],
  options: { signal?: AbortSignal; sourceHash?: string } = {}
) {
  options.signal?.throwIfAborted()
  // Matches the pinned NodeSnapshotEnvironment default. Keep this parent helper
  // independent of the combined assertion/spy bundle and its global registries.
  const expectedPath = join(
    dirname(testPath),
    '__snapshots__',
    `${basename(testPath)}.snap`
  )
  if (!Array.isArray(updates) || updates.length > 64)
    throw new Error('Invalid snapshot update plan.')
  const testDirectory = dirname(testPath)
  const seen = new Set<string>()
  for (const update of updates) {
    const target = resolve(update?.path ?? '')
    const rel = relative(testDirectory, target)
    const contained =
      rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
    if (
      !update ||
      update.path !== target ||
      !contained ||
      seen.has(target) ||
      (update.content !== null && typeof update.content !== 'string') ||
      (update.content === null && target !== expectedPath) ||
      (update.previousContent !== null &&
        typeof update.previousContent !== 'string')
    ) {
      throw new Error('Snapshot update does not match the original test file.')
    }
    seen.add(target)
    if (target === testPath) {
      if (
        !options.sourceHash ||
        update.previousContent === null ||
        createHash('sha256').update(update.previousContent).digest('hex') !==
          options.sourceHash
      ) {
        throw new Error(
          'Inline snapshot source does not match the compiled test revision.'
        )
      }
    } else if (
      target !== expectedPath &&
      relative(testDirectory, target).startsWith(`__snapshots__${sep}`)
    ) {
      throw new Error(
        'Raw snapshots cannot target the managed snapshot directory.'
      )
    }
    if ((await read(target)) !== update.previousContent)
      throw new Error(
        'Snapshot file changed during the test run; update refused.'
      )
  }
  const staged: {
    update: SnapshotUpdate
    temporary?: string
    backup?: string
    preserveBackup?: boolean
  }[] = []
  const published: (typeof staged)[number][] = []
  try {
    for (const update of updates) {
      options.signal?.throwIfAborted()
      await mkdir(dirname(update.path), { recursive: true })
      const item: (typeof staged)[number] = { update }
      staged.push(item)
      if (update.content !== null) {
        item.temporary = `${update.path}.${randomUUID()}.tmp`
        await writeFile(item.temporary, update.content, {
          encoding: 'utf8',
          flag: 'wx',
        })
      }
      if (update.previousContent !== null) {
        item.backup = `${update.path}.${randomUUID()}.backup`
        await writeFile(item.backup, update.previousContent, {
          encoding: 'utf8',
          flag: 'wx',
        })
      }
    }
    // Validate the whole write set again before the first replacement. This
    // preserves concurrent user edits and coordinates external/inline/raw bytes.
    for (const update of updates) {
      if ((await read(update.path)) !== update.previousContent)
        throw new Error(
          'Snapshot file changed during the test run; update refused.'
        )
    }
    options.signal?.throwIfAborted()
    for (const item of staged) {
      options.signal?.throwIfAborted()
      const { update } = item
      if ((await read(update.path)) !== update.previousContent)
        throw new Error(
          'Snapshot file changed during publication; update refused.'
        )
      if (update.content === null) await unlink(update.path)
      else await rename(item.temporary!, update.path)
      published.push(item)
    }
  } catch (error) {
    const failures: unknown[] = [error]
    for (const item of published.reverse()) {
      try {
        const { update } = item
        // Never restore over a user's edit made after our publication.
        if ((await read(update.path)) !== update.content)
          throw new Error(
            `Snapshot rollback refused a concurrent edit: ${update.path}`
          )
        if (item.backup) await rename(item.backup, update.path)
        else await unlink(update.path)
      } catch (rollbackError) {
        item.preserveBackup = true
        failures.push(rollbackError)
      }
    }
    if (failures.length === 1) throw error
    throw new AggregateError(
      failures,
      'Snapshot publication failed; recovery backups were retained.'
    )
  } finally {
    for (const item of staged) {
      for (const path of [
        item.temporary,
        item.preserveBackup ? undefined : item.backup,
      ]) {
        if (!path) continue
        await unlink(path).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error
        })
      }
    }
  }
}
