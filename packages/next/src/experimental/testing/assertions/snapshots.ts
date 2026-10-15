import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises'
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import type { SnapshotUpdate, SnapshotUpdatePlan } from './snapshot-common'
export {
  resolveSnapshotUpdateMode,
  stageSnapshotUpdates,
} from './snapshot-common'
export type {
  SnapshotUpdateMode,
  SnapshotUpdate,
  SnapshotUpdatePlan,
} from './snapshot-common'

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

async function read(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function validateSnapshotUpdates(
  testPath: string,
  updates: readonly SnapshotUpdate[],
  sourceHash?: string
) {
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
        !sourceHash ||
        update.previousContent === null ||
        createHash('sha256').update(update.previousContent).digest('hex') !==
          sourceHash
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
  }
}

const journalDirectoryName = '.next-test-snapshot-journals'
const journalName = /^[0-9a-f-]{36}\.json$/

function contains(directory: string, path: string) {
  const rel = relative(directory, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

function transactionItems(updates: readonly SnapshotUpdate[], id: string) {
  return updates.map((update) => ({
    update,
    temporary: update.content === null ? undefined : `${update.path}.${id}.tmp`,
    recovery: `${update.path}.${id}.recovery`,
    backup:
      update.previousContent === null
        ? undefined
        : `${update.path}.${id}.backup`,
  }))
}

async function removeOwnedFiles(items: ReturnType<typeof transactionItems>) {
  for (const item of items) {
    for (const path of [item.temporary, item.backup, item.recovery]) {
      if (!path) continue
      await unlink(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
  }
}

async function restoreSnapshot(
  item: ReturnType<typeof transactionItems>[number]
) {
  const { update, recovery } = item
  const current = await read(update.path)
  if (current === update.previousContent) return
  if (current !== update.content)
    throw new Error(
      `Snapshot recovery preserved a concurrent edit: ${update.path}`
    )
  if (update.previousContent === null) {
    await unlink(update.path)
    return
  }
  const prepared = await read(recovery)
  if (prepared !== null && prepared !== update.previousContent)
    throw new Error(`Snapshot recovery file changed: ${recovery}`)
  if (prepared === null)
    await writeFile(recovery, update.previousContent, {
      encoding: 'utf8',
      flag: 'wx',
      flush: true,
    })
  if ((await read(update.path)) !== current)
    throw new Error(
      `Snapshot recovery preserved a concurrent edit: ${update.path}`
    )
  await rename(recovery, update.path)
}

async function removeJournalDirectory(directory: string) {
  await rmdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') throw error
  })
}

/** Recover an interrupted publication before compilation, under the public run lock. */
export async function recoverSnapshotUpdates(projectDir: string) {
  const directory = join(projectDir, journalDirectoryName)
  let names: string[]
  try {
    names = await readdir(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const name of names.sort()) {
    if (name.endsWith('.prepare') && journalName.test(name.slice(0, -8))) {
      // No target changes occur until this prepared record is renamed.
      await unlink(join(directory, name))
      continue
    }
    if (!journalName.test(name)) continue
    const path = join(directory, name)
    const journal = JSON.parse(await readFile(path, 'utf8'))
    if (
      !journal ||
      typeof journal !== 'object' ||
      journal.version !== 1 ||
      typeof journal.testPath !== 'string' ||
      resolve(journal.testPath) !== journal.testPath ||
      !contains(resolve(projectDir), journal.testPath)
    )
      throw new Error('Invalid snapshot recovery journal.')
    validateSnapshotUpdates(
      journal.testPath,
      journal.updates,
      journal.sourceHash
    )
    const items = transactionItems(journal.updates, name.slice(0, -5))
    const failures: unknown[] = []
    for (const item of [...items].reverse()) {
      try {
        await restoreSnapshot(item)
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        'Snapshot recovery requires resolving a concurrent edit; journal retained.'
      )
    await removeOwnedFiles(items)
    await unlink(path)
  }
  await removeJournalDirectory(directory)
}

/** Called by the execution parent only after successful exit and cleanup. */
export async function commitSnapshotUpdates(
  testPath: string,
  updates: readonly SnapshotUpdate[],
  options: {
    signal?: AbortSignal
    sourceHash?: string
    projectDir?: string
  } = {}
) {
  options.signal?.throwIfAborted()
  validateSnapshotUpdates(testPath, updates, options.sourceHash)
  if (!updates.length) return
  for (const update of updates) {
    if ((await read(update.path)) !== update.previousContent)
      throw new Error(
        'Snapshot file changed during the test run; update refused.'
      )
  }
  const id = randomUUID()
  const directory = join(
    options.projectDir ?? dirname(testPath),
    journalDirectoryName
  )
  const journalPath = join(directory, `${id}.json`)
  const preparation = `${journalPath}.prepare`
  const staged = transactionItems(updates, id)
  const published: (typeof staged)[number][] = []
  let journalExists = false
  try {
    await mkdir(directory, { recursive: true })
    await writeFile(
      preparation,
      JSON.stringify({
        version: 1,
        testPath,
        sourceHash: options.sourceHash,
        updates,
      }),
      { encoding: 'utf8', flag: 'wx', flush: true }
    )
    await rename(preparation, journalPath)
    journalExists = true
    for (const item of staged) {
      options.signal?.throwIfAborted()
      const { update } = item
      await mkdir(dirname(update.path), { recursive: true })
      if (item.temporary)
        await writeFile(item.temporary, update.content!, {
          encoding: 'utf8',
          flag: 'wx',
          flush: true,
        })
      if (item.backup)
        await writeFile(item.backup, update.previousContent!, {
          encoding: 'utf8',
          flag: 'wx',
          flush: true,
        })
    }
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
    options.signal?.throwIfAborted()
    await removeOwnedFiles(staged)
    options.signal?.throwIfAborted()
    await unlink(journalPath)
    journalExists = false
  } catch (error) {
    const failures: unknown[] = [error]
    for (const item of published.reverse()) {
      try {
        await restoreSnapshot(item)
      } catch (rollbackError) {
        failures.push(rollbackError)
      }
    }
    if (failures.length === 1 && journalExists) {
      await removeOwnedFiles(staged)
      await unlink(journalPath)
      journalExists = false
    }
    if (failures.length === 1) throw error
    throw new AggregateError(
      failures,
      'Snapshot publication failed; recovery backups were retained.'
    )
  } finally {
    await unlink(preparation).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
    if (!journalExists) {
      await removeOwnedFiles(staged)
      if (!options.projectDir) await removeJournalDirectory(directory)
    }
  }
}
