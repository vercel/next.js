import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { AffectedSelection } from './select-affected'

interface RegistryFile {
  file: string
  sourceHash: string
}

export interface WatchRegistrySnapshot {
  /** Effective configuration/profile/selection, deliberately excluding entries. */
  configurationRevision: string
  entries: (RegistryFile & { id: string })[]
  /** Setup, serializers and configuration sources, separate from test entries. */
  inputs: RegistryFile[]
}

/** Input identity only; a closed native plan must independently prove no test edge. */
export function matchesRetainedSetupChange(options: {
  previous: WatchRegistrySnapshot | undefined
  current: WatchRegistrySnapshot | undefined
  changedPaths: readonly string[] | undefined
  setupFiles: readonly string[]
}): boolean {
  const { previous, current, changedPaths } = options
  if (
    !previous ||
    !current ||
    !changedPaths?.length ||
    !current.entries.length ||
    previous.configurationRevision !== current.configurationRevision ||
    previous.entries.length !== current.entries.length
  )
    return false
  const entries = new Map(current.entries.map((entry) => [entry.id, entry]))
  if (
    entries.size !== current.entries.length ||
    new Set(previous.entries.map((entry) => entry.id)).size !==
      previous.entries.length ||
    previous.entries.some((entry) => {
      const next = entries.get(entry.id)
      return next?.file !== entry.file || next.sourceHash !== entry.sourceHash
    })
  )
    return false
  const inputs = new Map(current.inputs.map((input) => [input.file, input]))
  const oldInputs = new Map(previous.inputs.map((input) => [input.file, input]))
  const setup = new Set(options.setupFiles)
  const changed = new Set(changedPaths)
  if (
    inputs.size !== current.inputs.length ||
    oldInputs.size !== previous.inputs.length ||
    inputs.size !== oldInputs.size ||
    changedPaths.some(
      (file) =>
        !isAbsolute(file) ||
        resolve(file) !== file ||
        !setup.has(file) ||
        !inputs.has(file) ||
        !oldInputs.has(file)
    )
  )
    return false
  return previous.inputs.every((input) => {
    const next = inputs.get(input.file)
    return (
      next !== undefined &&
      (changed.has(input.file) || next.sourceHash === input.sourceHash)
    )
  })
}

/** Byte identities guard registry policy; they are not compiler dependencies. */
export async function snapshotWatchRegistry(options: {
  configurationRevision: string
  entries: readonly { id: string; file: string }[]
  inputs: readonly string[]
  signal?: AbortSignal
}): Promise<WatchRegistrySnapshot | undefined> {
  const hashes = new Map<string, string>()
  try {
    for (const file of new Set([
      ...options.entries.map((entry) => entry.file),
      ...options.inputs,
    ])) {
      options.signal?.throwIfAborted()
      if (!isAbsolute(file) || resolve(file) !== file) return
      const before = await lstat(file, { bigint: true })
      // A link can change its target without changing the observed source path.
      if (!before.isFile()) return
      const bytes = await readFile(file)
      const after = await lstat(file, { bigint: true })
      if (
        !after.isFile() ||
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs
      )
        return
      hashes.set(file, createHash('sha256').update(bytes).digest('hex'))
    }
    options.signal?.throwIfAborted()
    return {
      configurationRevision: options.configurationRevision,
      entries: options.entries.map(({ id, file }) => ({
        id,
        file,
        sourceHash: hashes.get(file)!,
      })),
      inputs: [...new Set(options.inputs)].sort().map((file) => ({
        file,
        sourceHash: hashes.get(file)!,
      })),
    }
  } catch {
    options.signal?.throwIfAborted()
    // A missing, unreadable or racing file cannot certify a registry-only edit.
    // Discovery/compilation still reports its normal diagnostic on the full run.
    return undefined
  }
}

/**
 * The pinned onFileCreate policy schedules matching new tests on their own.
 * This does not claim that creating a file cannot affect unresolved imports or
 * import.meta.glob. Source changes still need real compiler dependency evidence.
 */
export function selectRegistryAdditions(options: {
  previous: WatchRegistrySnapshot | undefined
  current: WatchRegistrySnapshot | undefined
  changedPaths: readonly string[] | undefined
}): AffectedSelection | undefined {
  const { previous, current, changedPaths } = options
  if (
    !previous ||
    !current ||
    !changedPaths?.length ||
    previous.configurationRevision !== current.configurationRevision
  )
    return
  const inputs = new Map(current.inputs.map((input) => [input.file, input]))
  if (
    inputs.size !== previous.inputs.length ||
    previous.inputs.some(
      (input) => inputs.get(input.file)?.sourceHash !== input.sourceHash
    )
  )
    return
  const entries = new Map(current.entries.map((entry) => [entry.id, entry]))
  if (entries.size !== current.entries.length) return
  for (const entry of previous.entries) {
    const next = entries.get(entry.id)
    if (next?.file !== entry.file || next.sourceHash !== entry.sourceHash)
      return
  }
  const previousIds = new Set(previous.entries.map((entry) => entry.id))
  const previousFiles = new Set(previous.entries.map((entry) => entry.file))
  const added = current.entries.filter((entry) => !previousIds.has(entry.id))
  if (!added.length) return
  const files = new Set(added.map((entry) => entry.file))
  if (
    [...files].some((file) => previousFiles.has(file) || inputs.has(file)) ||
    changedPaths.some(
      (file) => !isAbsolute(file) || !files.has(file) || resolve(file) !== file
    ) ||
    files.size !== new Set(changedPaths).size
  )
    return
  return {
    entryIds: added.map((entry) => entry.id),
    reason: 'test-registry-addition',
  }
}
