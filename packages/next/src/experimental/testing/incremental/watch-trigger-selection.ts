import { lstat } from 'node:fs/promises'
import type { WatchTriggerMatch } from '../config-watch-triggers'

/** A named scope is not necessarily a real changed/added regular file. */
export async function classifyWatchTriggerSources(
  files: readonly string[],
  signal: AbortSignal
): Promise<string[]> {
  const selected: string[] = []
  for (let start = 0; start < files.length; start += 32) {
    signal.throwIfAborted()
    const batch = files.slice(start, start + 32)
    const results = await Promise.allSettled(
      batch.map(async (file) => {
        try {
          return (await lstat(file)).isFile() ? file : undefined
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code === 'ENOENT' ||
            (error as NodeJS.ErrnoException).code === 'ENOTDIR'
          )
            return undefined
          throw error
        }
      })
    )
    // Every started read is joined before cancellation or another I/O failure
    // can release this observation owner.
    signal.throwIfAborted()
    const errors: unknown[] = []
    for (const result of results) {
      if (result.status === 'rejected') errors.push(result.reason)
      else if (result.value !== undefined) selected.push(result.value)
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length)
      throw new AggregateError(
        errors,
        'Watch trigger input classification failed.'
      )
  }
  signal.throwIfAborted()
  return selected
}

/** Explicit authored requests select actual current specifications by file. */
export function resolveWatchTriggerSelection(
  entries: readonly { id: string; file: string }[],
  changedPaths: readonly string[],
  matches: readonly WatchTriggerMatch[]
): {
  entryIds: string[]
  fallbackPaths: string[]
  requestedFiles: string[]
} {
  const matched = new Set<string>()
  const fallback = new Set<string>()
  const requested = new Set<string>()
  for (const match of matches) {
    if (!match.matched) fallback.add(match.source)
    else {
      matched.add(match.source)
      for (const file of match.tests) requested.add(file)
    }
  }
  return {
    entryIds: entries
      .filter((entry) => requested.has(entry.file))
      .map((entry) => entry.id),
    fallbackPaths: changedPaths.filter(
      (file) => !matched.has(file) || fallback.has(file)
    ),
    requestedFiles: [...requested],
  }
}

/** Classify concurrently, but enter authored mappers in delivered event order. */
export function createOrderedWatchTriggerEvaluator() {
  let previous: Promise<void> = Promise.resolve()
  return function evaluate(
    classification: Promise<string[]>,
    signal: AbortSignal,
    run: (files: string[]) => Promise<WatchTriggerMatch[]>
  ): Promise<WatchTriggerMatch[]> {
    // Own a later rejection immediately, even while an earlier read is pending.
    // The boolean preserves an actual thrown undefined or another falsy value.
    const observed = classification.then(
      (files) => ({ success: true as const, files }),
      (failure: unknown) => ({ success: false as const, failure })
    )
    const work = previous.then(async () => {
      const outcome = await observed
      if (!outcome.success) throw outcome.failure
      signal.throwIfAborted()
      return run(outcome.files)
    })
    previous = work.then(
      () => {},
      () => {}
    )
    return work
  }
}
