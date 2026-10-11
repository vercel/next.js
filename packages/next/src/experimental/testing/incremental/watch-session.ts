import {
  selectAffectedTests,
  type AffectedSelection,
  type DependencyChange,
} from './select-affected'

export interface WatchDiscovery {
  entryIds: readonly string[]
  /** Includes configuration, setup order, profiles and discovered entry IDs. */
  discoveryRevision: string
}

export interface WatchInvalidation {
  /** Omit for filesystem notifications without compiler dependency evidence. */
  changes?: readonly DependencyChange[]
  invalidateAll?: boolean
}

export interface WatchRun<Discovery extends WatchDiscovery> {
  discovery: Discovery
  selection: AffectedSelection
  generation: number
  signal: AbortSignal
}

export interface WatchSessionOptions<Discovery extends WatchDiscovery> {
  signal?: AbortSignal
  discover(signal: AbortSignal): Promise<Discovery>
  /** Resolves only after all workers, compiler graphs and output owners close. */
  run(run: WatchRun<Discovery>): Promise<{
    status: 'passed' | 'failed' | 'cancelled'
    /** Stop permanently if resource/output ownership could not be released. */
    unsafeCleanup?: boolean
  }>
  /** Configuration/compilation errors are recoverable on the next invalidation. */
  onError(error: unknown): void
}

/** A superseded run is cancelled, but its cleanup is never detached. */
export class SupersededTestRun extends Error {
  constructor() {
    super('Test run superseded by a change.')
    this.name = 'SupersededTestRun'
  }
}

/**
 * Own scheduling only. Discovery reloads config each time; run owns fresh
 * compilation and execution. No evaluated state or live output writer survives
 * its Promise. The change source must be acquired before creating this session.
 */
export function createWatchSession<Discovery extends WatchDiscovery>(
  options: WatchSessionOptions<Discovery>
) {
  let closed = false
  let generation = 0
  let pending = true
  let pendingChanges: DependencyChange[] = []
  let missingEvidence = true
  let invalidateAll = true
  let previousEntryIds: readonly string[] = []
  let previousDiscoveryRevision: string | undefined
  let retryAll = true
  let active: AbortController | undefined
  let draining: Promise<void> | undefined
  let fatalError: unknown
  let fatal = false
  let resolveClosed!: () => void
  const whenClosed = new Promise<void>((resolve) => {
    resolveClosed = resolve
  })

  function report(error: unknown) {
    try {
      options.onError(error)
    } catch (reporterError) {
      // A failed reporter cannot be silently ignored or reported recursively.
      fatal = true
      fatalError = reporterError
      closed = true
      pending = false
    }
  }

  async function drain() {
    while (!closed && pending) {
      pending = false
      const changes = missingEvidence ? undefined : pendingChanges
      const globalInvalidation = invalidateAll || retryAll
      pendingChanges = []
      missingEvidence = false
      invalidateAll = false
      const runGeneration = ++generation
      const controller = new AbortController()
      active = controller
      try {
        const discovery = await options.discover(controller.signal)
        controller.signal.throwIfAborted()
        const selection = selectAffectedTests({
          entryIds: discovery.entryIds,
          previousEntryIds,
          discoveryRevision: discovery.discoveryRevision,
          changes,
          invalidateAll:
            globalInvalidation ||
            (previousDiscoveryRevision !== undefined &&
              previousDiscoveryRevision !== discovery.discoveryRevision),
        })
        // Empty discovery is a valid watch state (e.g. the last test deleted).
        // Do not ask the one-shot runner to report "No test files selected".
        const result = selection.entryIds.length
          ? await options.run({
              discovery,
              selection,
              signal: controller.signal,
              generation: runGeneration,
            })
          : { status: 'passed' as const }
        if (result.unsafeCleanup) {
          cancel()
          return
        }
        controller.signal.throwIfAborted()
        retryAll = result.status !== 'passed'
        if (!retryAll) {
          previousEntryIds = [...discovery.entryIds]
          previousDiscoveryRevision = discovery.discoveryRevision
        }
      } catch (error) {
        // Failed or cancelled runs never certify a dependency baseline. A
        // change during compilation/discovery is retained in the next batch.
        retryAll = true
        if (!controller.signal.aborted || error !== controller.signal.reason) {
          report(error)
        }
      } finally {
        active = undefined
        if (closed) options.signal?.removeEventListener('abort', cancel)
      }
    }
  }

  function schedule() {
    if (closed || draining) return
    // Coalesce synchronous notifications without delaying them with a timer.
    draining = Promise.resolve()
      .then(drain)
      .finally(() => {
        draining = undefined
        if (closed) resolveClosed()
        if (!closed && pending) schedule()
      })
  }

  function invalidate(change: WatchInvalidation = {}) {
    if (closed) return
    pending = true
    invalidateAll ||= change.invalidateAll === true
    if (change.changes === undefined) {
      missingEvidence = true
      pendingChanges = []
    } else if (!missingEvidence) {
      // Copy the evidence so a producer cannot mutate a pending batch.
      for (const evidence of change.changes) {
        pendingChanges.push({
          ...evidence,
          affectedEntryIds: [...evidence.affectedEntryIds],
        })
      }
    }
    active?.abort(new SupersededTestRun())
    schedule()
  }

  async function waitForIdle() {
    while (draining) await draining
    if (fatal) throw fatalError
  }

  function cancel() {
    closed = true
    pending = false
    pendingChanges = []
    active?.abort(options.signal?.reason ?? new Error('Watch session closed.'))
    options.signal?.removeEventListener('abort', cancel)
    if (!draining) resolveClosed()
  }

  async function close() {
    cancel()
    await waitForIdle()
  }

  if (options.signal?.aborted) cancel()
  else {
    options.signal?.addEventListener('abort', cancel, { once: true })
    schedule()
  }

  return { invalidate, waitForIdle, close, closed: whenClosed }
}
