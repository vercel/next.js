import {
  selectAffectedTests,
  type AffectedSelection,
  type DependencyChange,
} from './select-affected'
import {
  selectRegistryAdditions,
  selectRegistryRemovals,
  type WatchRegistrySnapshot,
} from './registry-additions'

export interface WatchDiscovery {
  entryIds: readonly string[]
  /** Includes configuration, setup order, profiles and discovered entry IDs. */
  discoveryRevision: string
  /** Optional byte evidence for the separate matching-new-test policy. */
  registry?: WatchRegistrySnapshot
}

export interface WatchInvalidation {
  /** Exact filesystem paths; never interpreted as compiler dependencies. */
  registryPaths?: readonly string[]
  /** Omit for filesystem notifications without compiler dependency evidence. */
  changes?: readonly DependencyChange[]
  invalidateAll?: boolean
}

export interface WatchRun<Discovery extends WatchDiscovery> {
  discovery: Discovery
  selection: AffectedSelection
  generation: number
  /** Coalesced filesystem notifications, separate from compiler dependency facts. */
  changedPaths?: readonly string[]
  signal: AbortSignal
}

export interface WatchRunResult {
  status: 'passed' | 'failed' | 'cancelled'
  /** Stop permanently if resource/output ownership could not be released. */
  unsafeCleanup?: boolean
  /** Parent-sealed user scheduling cancellation; no baseline is implied. */
  closedUserCancellation?: true
  /** Every discovered Browser file compiled and closed under the same selection. */
  retainBaselineOnClosedCancellation?: true
  /** A committed snapshot change needs a complete run after this one settles. */
  rerunAfterSettled?: boolean
}

export interface WatchSessionOptions<Discovery extends WatchDiscovery> {
  signal?: AbortSignal
  discover(signal: AbortSignal): Promise<Discovery>
  /** Optional closed-owner/compiler proof; uncertainty retains ordinary execution. */
  canSkipUnchangedRun?(input: {
    discovery: Discovery
    previousRegistry: WatchRegistrySnapshot | undefined
    changedPaths: readonly string[] | undefined
    signal: AbortSignal
  }): Promise<boolean>
  /** Handle only proven idle test removals; false preserves ordinary execution. */
  onRegistryRemoved?(input: {
    discovery: Discovery
    files: readonly string[]
    signal: AbortSignal
  }): Promise<boolean>
  /** A closed compiler plan can refine a run without dropping watched entries. */
  selectTests?(input: {
    discovery: Discovery
    selection: AffectedSelection
    changedPaths: readonly string[] | undefined
    invalidateAll: boolean
    signal: AbortSignal
  }): Promise<AffectedSelection | undefined>
  /** Resolves only after all workers, compiler graphs and output owners close. */
  run(run: WatchRun<Discovery>): Promise<WatchRunResult>
  /** Publishes readiness after cleanup, baseline commitment and cancellation release. */
  onRunSettled?(
    status: 'passed' | 'failed' | 'cancelled',
    discovery: Discovery,
    retainedCancellation?: { retainBaselineOnClosedCancellation: true }
  ): unknown
  /** Configuration/compilation errors are recoverable on the next invalidation. */
  onError(error: unknown): void
  /** A report owner must replace results when discovery becomes empty. */
  runEmpty?: boolean | ((discovery: Discovery) => boolean)
  /** Publish a first empty compiler selection before committing watch readiness. */
  publishInitialEmptySelection?(discovery: Discovery): boolean
}

/** A superseded run is cancelled, but its cleanup is never detached. */
export class SupersededTestRun extends Error {
  constructor() {
    super('Test run superseded by a change.')
    this.name = 'SupersededTestRun'
  }
}

/**
 * Own scheduling only. Discovery validates configuration identities each time;
 * run owns fresh compilation and test execution. The coordinator may retain a
 * compiler configuration service across runs. No evaluated test state or live
 * output writer survives run. Acquire the change source before this session.
 */
export function createWatchSession<Discovery extends WatchDiscovery>(
  options: WatchSessionOptions<Discovery>
) {
  let closed = false
  let generation = 0
  let pending = true
  let pendingChanges: DependencyChange[] = []
  let pendingRegistryPaths: string[] = []
  let unknownRegistryPaths = true
  let missingEvidence = true
  let invalidateAll = true
  let previousEntryIds: readonly string[] = []
  let previousDiscoveryRevision: string | undefined
  let previousRegistry: WatchRegistrySnapshot | undefined
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
      const registryPaths = unknownRegistryPaths
        ? undefined
        : pendingRegistryPaths
      pendingRegistryPaths = []
      unknownRegistryPaths = false
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
        const registrySelection =
          !globalInvalidation && changes === undefined
            ? selectRegistryAdditions({
                previous: previousRegistry,
                current: discovery.registry,
                changedPaths: registryPaths,
              })
            : undefined
        const removed =
          !globalInvalidation &&
          changes === undefined &&
          options.onRegistryRemoved
            ? selectRegistryRemovals({
                previous: previousRegistry,
                current: discovery.registry,
                changedPaths: registryPaths,
              })
            : undefined
        const removalOnly =
          removed !== undefined &&
          (await options.onRegistryRemoved!({
            discovery,
            files: removed,
            signal: controller.signal,
          }))
        let unchanged =
          removalOnly ||
          (!globalInvalidation &&
            changes === undefined &&
            !registrySelection &&
            discovery.entryIds.length > 0 &&
            previousDiscoveryRevision === discovery.discoveryRevision &&
            (await options.canSkipUnchangedRun?.({
              discovery,
              previousRegistry,
              changedPaths: registryPaths,
              signal: controller.signal,
            })) === true)
        controller.signal.throwIfAborted()
        if (
          closed ||
          pending ||
          generation !== runGeneration ||
          active !== controller
        )
          throw new SupersededTestRun()
        let selection =
          (unchanged
            ? { entryIds: [], reason: 'compiler-dependencies' as const }
            : undefined) ??
          registrySelection ??
          selectAffectedTests({
            entryIds: discovery.entryIds,
            previousEntryIds,
            discoveryRevision: discovery.discoveryRevision,
            changes,
            invalidateAll:
              globalInvalidation ||
              (previousDiscoveryRevision !== undefined &&
                previousDiscoveryRevision !== discovery.discoveryRevision),
          })
        if (!unchanged && options.selectTests) {
          const refined = await options.selectTests({
            discovery,
            selection,
            changedPaths: registryPaths,
            invalidateAll: globalInvalidation,
            signal: controller.signal,
          })
          controller.signal.throwIfAborted()
          if (
            closed ||
            pending ||
            generation !== runGeneration ||
            active !== controller
          )
            throw new SupersededTestRun()
          if (refined) {
            const current = new Set(discovery.entryIds)
            if (
              refined.entryIds.some((entryId) => !current.has(entryId)) ||
              new Set(refined.entryIds).size !== refined.entryIds.length
            )
              throw new Error(
                'Compiler watch selection contains unknown entries.'
              )
            selection = refined
            unchanged =
              refined.entryIds.length === 0 &&
              discovery.entryIds.length > 0 &&
              (previousDiscoveryRevision !== undefined ||
                options.publishInitialEmptySelection?.(discovery) !== true)
          }
        }
        // Empty discovery is a valid watch state (e.g. the last test deleted).
        // Do not ask the one-shot runner to report "No test files selected".
        const runEmpty =
          typeof options.runEmpty === 'function'
            ? options.runEmpty(discovery)
            : options.runEmpty
        const result: WatchRunResult =
          !unchanged && (selection.entryIds.length || runEmpty)
            ? await options.run({
                discovery,
                selection,
                signal: controller.signal,
                generation: runGeneration,
                changedPaths: registryPaths
                  ? [...new Set(registryPaths)]
                  : undefined,
              })
            : { status: 'passed' as const }
        if (result.unsafeCleanup) {
          cancel()
          return
        }
        controller.signal.throwIfAborted()
        if (result.closedUserCancellation && result.status !== 'cancelled')
          throw new Error('Invalid closed user-cancellation result.')
        if (
          result.retainBaselineOnClosedCancellation &&
          (result.status !== 'cancelled' || !result.closedUserCancellation)
        )
          throw new Error('Invalid closed cancellation baseline.')
        retryAll =
          result.status !== 'passed' &&
          !result.retainBaselineOnClosedCancellation
        if (!retryAll) {
          previousEntryIds = [...discovery.entryIds]
          previousDiscoveryRevision = discovery.discoveryRevision
          previousRegistry = discovery.registry
            ? structuredClone(discovery.registry)
            : undefined
        }
        // A terminal can trigger the next edit immediately. Release this run
        // only after its baseline is committed, before publishing readiness.
        active = undefined
        try {
          if (
            !closed &&
            !pending &&
            !removalOnly &&
            (result.status !== 'cancelled' ||
              result.closedUserCancellation === true)
          ) {
            if (result.retainBaselineOnClosedCancellation)
              await options.onRunSettled?.(result.status, discovery, {
                retainBaselineOnClosedCancellation: true,
              })
            else await options.onRunSettled?.(result.status, discovery)
          }
        } finally {
          if (result.rerunAfterSettled) invalidate({ invalidateAll: true })
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
    if (change.registryPaths === undefined) {
      unknownRegistryPaths = true
      pendingRegistryPaths = []
    } else if (!unknownRegistryPaths) {
      pendingRegistryPaths.push(...change.registryPaths)
    }
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
    pendingRegistryPaths = []
    active?.abort(options.signal?.reason ?? new Error('Watch session closed.'))
    options.signal?.removeEventListener('abort', cancel)
    if (!draining) resolveClosed()
  }

  function cancelCurrent() {
    active?.abort(new SupersededTestRun())
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

  return { invalidate, cancelCurrent, waitForIdle, close, closed: whenClosed }
}
