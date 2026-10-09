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

/** Bytes cross IPC; executable snapshot environments never do. */
export interface SnapshotUpdate {
  path: string
  content: string
  previousContent: string | null
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
        // Deletion is deliberately unavailable, including empty/partial runs.
        if (property === 'removeSnapshotFile') return async () => {}
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
      typeof update.content !== 'string' ||
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
  const staged: { target: string; temporary: string }[] = []
  try {
    for (const update of updates) {
      options.signal?.throwIfAborted()
      await mkdir(dirname(update.path), { recursive: true })
      const temporary = `${update.path}.${randomUUID()}.tmp`
      await writeFile(temporary, update.content, {
        encoding: 'utf8',
        flag: 'wx',
      })
      staged.push({ target: update.path, temporary })
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
    for (const item of staged) await rename(item.temporary, item.target)
  } finally {
    for (const { temporary } of staged) {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
  }
}
