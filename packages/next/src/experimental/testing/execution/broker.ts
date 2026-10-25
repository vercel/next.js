import { isTestCI } from '../config-environment'
import type { CompiledCoverageSource } from '../coverage/types'
import type { CustomCoverageCompletion } from '../coverage/custom-types'
import { randomUUID } from 'node:crypto'
import type {
  CompiledTestArtifact,
  CompiledTestCohort,
  ExecuteTestCohort,
  ExecuteTest,
  ExecuteTestOptions,
  TestCoverageCompletion,
  TestExecutionResult,
} from '../contracts'
import type { ResultEvent, SerializedDiagnostic } from '../reporting/events'
import { serializeDiagnostic } from '../reporting/diagnostics'
import { executeWithEnvironment } from './execute'
import {
  executeCohortWithEnvironment,
  CohortExecutionClosedError,
  isCohortExecutionClosedError,
} from './execute-cohort'
import {
  resolveSnapshotUpdateMode,
  type SnapshotUpdate,
} from '../assertions/snapshots'
import { parseMaxWorkers } from '../scheduling'
import type { DiscoveredTestProject } from '../discovery'
import { mkdtemp, rm } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type SerializableOptions = Omit<
  ExecuteTestOptions,
  | 'signal'
  | 'userCancelSignal'
  | 'onEvent'
  | 'onCoverage'
  | 'onCustomCoverage'
  | 'onCustomCoverageSuite'
  | 'onSnapshotUpdates'
>

export type ExecutionBrokerRequest =
  | {
      type: 'execution-broker-request'
      id: string
      action: 'execute'
      artifact: CompiledTestArtifact
      options: SerializableOptions
      /** Private IPC only: never log, fingerprint, or report this object. */
      env: NodeJS.ProcessEnv
    }
  | {
      type: 'execution-broker-request'
      id: string
      action: 'execute-cohort'
      cohort: CompiledTestCohort
      options: readonly SerializableOptions[]
      /** Private IPC only, including resolved compiler configuration effects. */
      env: NodeJS.ProcessEnv
    }
  | {
      type: 'execution-broker-request'
      id: string
      action: 'source-analysis'
      compiled: CompiledCoverageSource
    }
  | { type: 'execution-broker-request'; id: string; action: 'cancel' }

export type ExecutionBrokerResponse =
  | {
      type: 'execution-broker-response'
      id: string
      action: 'source-analysis-result'
    }
  | {
      type: 'execution-broker-response'
      id: string
      action: 'custom-coverage'
      completion: CustomCoverageCompletion
    }
  | {
      type: 'execution-broker-response'
      id: string
      action: 'coverage'
      completion: TestCoverageCompletion
    }
  | {
      type: 'execution-broker-response'
      id: string
      action: 'event'
      event: ResultEvent
    }
  | {
      type: 'execution-broker-response'
      id: string
      action: 'result'
      result: TestExecutionResult
    }
  | {
      type: 'execution-broker-response'
      id: string
      action: 'cohort-result'
      results: readonly TestExecutionResult[]
    }
  | {
      type: 'execution-broker-response'
      id: string
      action: 'error'
      error: SerializedDiagnostic
      /** Issued by the parent owner; never accepted from a child request. */
      ownershipClosed?: true
      cancelled?: true
    }

export interface BrowserApplicationOwnership {
  profile: import('../contracts').TestProfile
  projectDir: string
  distDir: string
  lockDistDir: boolean
}

/** The watch parent owns every detached file worker, including after child crash. */
export function createExecutionBrokerHost(options: {
  signal: AbortSignal
  /** Parent-only capture; completion never grants compiler-child rights. */
  captureCompletedModuleResult?: true
  /** Parent-owned scheduling request, independent of the generation lifetime. */
  userCancelSignal?: AbortSignal
  /** Actual admitted fork, observed in this host before its launch send. */
  onWorkerLaunched?: (identity: {
    entryId: string
    runId: string
    revision: string
  }) => void
  send(message: ExecutionBrokerResponse): Promise<void>
  /** One-shot supervisors only. Watch still rejects coverage. */
  allowCoverage?: boolean
  /** One-shot isolated-profile supervisors only; ordinary watch rejects cohorts. */
  allowCohorts?: boolean
  maxWorkers?: number
  /** Parent authorization and byte-derived analysis; never invokes a test worker. */
  onCoverageSource?: (
    compiled: CompiledCoverageSource,
    signal: AbortSignal
  ) => Promise<void>
  /** Parent validates before evaluation and seals after worker cleanup. */
  onRuntimeConfiguration?: (
    artifact: CompiledTestArtifact,
    signal: AbortSignal
  ) => Promise<() => Promise<void>>
  /** Parent-owned provider hook, awaited while the file collector is running. */
  onCustomCoverageSuite?: (
    artifact: CompiledTestArtifact,
    execution: SerializableOptions,
    completion: CustomCoverageCompletion
  ) => Promise<void>
  browserApplications?: readonly BrowserApplicationOwnership[]
  /** Parent-discovered registration; child endpoint/fixture metadata is never trusted. */
  browserProjects?: readonly Pick<
    DiscoveredTestProject,
    | 'profile'
    | 'entries'
    | 'browserFixtures'
    | 'browserEngine'
    | 'browserHeadless'
    | 'includeTaskLocation'
  >[]
  /** Explicit parent authorization; plans are committed after generation cleanup. */
  onSnapshotUpdates?: (
    entryId: string,
    file: string,
    updates: SnapshotUpdate[],
    sourceHash?: string
  ) => Promise<void>
}) {
  const maxWorkers = parseMaxWorkers(options.maxWorkers ?? 1)
  const active = new Map<
    string,
    { controller: AbortController; task: Promise<void>; leased: boolean }
  >()
  const seen = new Set<string>()
  let closing: Promise<void> | undefined
  let closed = false
  let ownershipClosed = false
  let transportFailure: { error: unknown } | undefined
  const cleanupFailures: unknown[] = []
  let sends = Promise.resolve()
  let releaseSends!: () => void
  const stopped = new Promise<void>((resolve) => {
    releaseSends = resolve
  })

  function abortAll(reason: unknown) {
    for (const request of active.values()) request.controller.abort(reason)
  }
  const onAbort = () => abortAll(options.signal.reason)
  options.signal.addEventListener('abort', onAbort)

  function publish(message: ExecutionBrokerResponse) {
    if (closed) return Promise.resolve()
    sends = sends.then(() => {
      if (!closed) return options.send(message)
    })
    // Observe sends as soon as queued, even while execute is still running.
    void sends.catch((error) => {
      transportFailure ??= { error }
      abortAll(error)
    })
    return Promise.race([sends, stopped])
  }

  return {
    /** Available after close settles, including a transport-only rejection. */
    get ownershipClosed() {
      return ownershipClosed
    },
    handle(value: unknown): boolean {
      if (
        !value ||
        typeof value !== 'object' ||
        !('type' in value) ||
        value.type !== 'execution-broker-request'
      ) {
        return false
      }
      const message = value as ExecutionBrokerRequest
      if (typeof message.id !== 'string' || !message.id) {
        throw new Error('Invalid execution broker request identity')
      }
      if (message.action === 'cancel') {
        active
          .get(message.id)
          ?.controller.abort(new Error('Test file cancelled'))
        return true
      }
      if (
        message.action !== 'execute' &&
        message.action !== 'execute-cohort' &&
        message.action !== 'source-analysis'
      ) {
        throw new Error('Invalid execution broker request action')
      }
      if (closed || transportFailure || cleanupFailures.length > 0) {
        throw new Error('The execution broker is closed')
      }
      if (seen.has(message.id)) {
        throw new Error('Duplicate execution broker request identity')
      }
      if (
        [...active.values()].filter((request) => request.leased).length >=
        maxWorkers
      ) {
        throw new Error('Execution broker file-worker limit exceeded')
      }
      seen.add(message.id)
      const request = {
        controller: new AbortController(),
        task: Promise.resolve(),
        leased: true,
      }
      active.set(message.id, request)
      if (options.signal.aborted)
        request.controller.abort(options.signal.reason)
      request.task = (async () => {
        let executing = false
        try {
          if (message.action === 'source-analysis') {
            if (!options.onCoverageSource)
              throw new Error('Unrequested compiler coverage source analysis')
            await options.onCoverageSource(
              message.compiled,
              request.controller.signal
            )
            request.controller.signal.throwIfAborted()
            request.leased = false
            await publish({
              type: 'execution-broker-response',
              id: message.id,
              action: 'source-analysis-result',
            })
            return
          }
          if (message.action === 'execute-cohort') {
            if (!options.allowCohorts)
              throw new Error(
                'Watch execution does not support shared worker cohorts'
              )
            if (
              !Array.isArray(message.options) ||
              !message.options.length ||
              message.options.some(
                (execution) =>
                  execution.customCoverage ||
                  execution.coverage ||
                  execution.browser ||
                  (resolveSnapshotUpdateMode(execution) !== 'none' &&
                    !options.onSnapshotUpdates)
              )
            )
              throw new Error(
                'Unsupported shared cohort execution or unauthorized snapshot updates'
              )
            executing = true
            const results = await executeCohortWithEnvironment(
              message.cohort,
              message.options.map((execution) => ({
                ...execution,
                signal: request.controller.signal,
                onEvent(event) {
                  void publish({
                    type: 'execution-broker-response',
                    id: message.id,
                    action: 'event',
                    event,
                  }).catch(() => {})
                },
              })),
              { ...message.env },
              options.onSnapshotUpdates
            )
            executing = false
            request.leased = false
            await publish({
              type: 'execution-broker-response',
              id: message.id,
              action: 'cohort-result',
              results,
            })
            return
          }
          if (
            ((message.options.coverage || message.options.customCoverage) &&
              !options.allowCoverage) ||
            (resolveSnapshotUpdateMode(message.options) !== 'none' &&
              !options.onSnapshotUpdates) ||
            message.options.browser ||
            (message.artifact.profile.environment === 'browser' &&
              !options.browserProjects?.some(
                (project) =>
                  isDeepStrictEqual(
                    project.profile,
                    message.artifact.profile
                  ) &&
                  (project.profile.browserClient === true
                    ? (project.browserEngine ?? 'chromium') ===
                        (message.options.browserEngine ?? 'chromium') &&
                      (project.browserHeadless ?? isTestCI) ===
                        (message.options.browserHeadless ?? isTestCI)
                    : message.options.browserEngine === undefined &&
                      message.options.browserHeadless === undefined) &&
                  project.includeTaskLocation ===
                    message.options.includeTaskLocation &&
                  project.entries.some(
                    (entry) =>
                      entry.id === message.artifact.entryId &&
                      isDeepStrictEqual(entry, message.options.entry)
                  )
              ))
          ) {
            throw new Error(
              'Watch execution requires authorized parent-owned browser resources; unauthorized coverage and snapshot updates are unavailable'
            )
          }
          if (message.artifact.profile.environment === 'browser') {
            if (
              (message.artifact.kind === 'browser') !==
              (message.artifact.profile.browserClient === true)
            )
              throw new Error(
                'Browser artifact kind differs from its parent-authorized profile.'
              )
            if (
              message.artifact.kind === 'node' &&
              !message.options.collectOnly
            ) {
              const application = options.browserApplications?.find(
                (candidate) =>
                  isDeepStrictEqual(candidate.profile, message.artifact.profile)
              )
              if (
                !application ||
                application.projectDir !== message.options.projectDir ||
                !isDeepStrictEqual(message.artifact.applicationServer, {
                  mode: application.profile.mode,
                  distDir: application.distDir,
                  lockDistDir: application.lockDistDir,
                })
              )
                throw new Error(
                  'Browser application metadata differs from parent-resolved ownership.'
                )
            }
          }
          if (
            (message.artifact.runtimeConfigurationImports ||
              options.onRuntimeConfiguration) &&
            (!options.onRuntimeConfiguration ||
              !message.options.coverage ||
              message.options.customCoverage)
          )
            throw new Error(
              'Runtime config receipts require parent-authorized standard coverage execution'
            )
          const notExecuted = async () => {
            request.controller.signal.throwIfAborted()
            if (!options.userCancelSignal?.aborted) return false
            const browser =
              message.artifact.kind === 'browser' &&
              message.artifact.profile.browserClient === true &&
              !message.options.coverage
            if (
              (!message.options.coverage && !browser) ||
              message.options.customCoverage ||
              message.options.collectOnly ||
              resolveSnapshotUpdateMode(message.options) === 'all' ||
              (!browser && message.artifact.kind !== 'node') ||
              (!browser && message.artifact.profile.environment !== 'node') ||
              message.artifact.profile.route !== undefined ||
              (message.artifact.kind === 'node' &&
                message.artifact.cohort !== undefined)
            )
              throw new Error(
                'User cancellation requires ordinary Node coverage.'
              )
            request.leased = false
            await publish({
              type: 'execution-broker-response',
              id: message.id,
              action: 'result',
              result: {
                entryId: message.artifact.entryId,
                status: 'cancelled',
                durationMs: 0,
                notExecuted: true,
              },
            })
            return true
          }
          if (options.userCancelSignal?.aborted && (await notExecuted())) return
          const sealRuntimeConfiguration = options.onRuntimeConfiguration
            ? await options.onRuntimeConfiguration(
                message.artifact,
                request.controller.signal
              )
            : undefined
          if (options.userCancelSignal?.aborted && (await notExecuted())) return
          if (
            message.options.captureCompletedModuleResult &&
            !options.captureCompletedModuleResult
          )
            throw new Error('Unrequested private module completion capture.')
          executing = true
          const result = await executeBrokerFile(
            message.artifact,
            {
              ...message.options,
              ...(options.captureCompletedModuleResult
                ? { captureCompletedModuleResult: true }
                : {}),
              signal: request.controller.signal,
              userCancelSignal: options.userCancelSignal,
              onEvent(event) {
                void publish({
                  type: 'execution-broker-response',
                  id: message.id,
                  action: 'event',
                  event,
                }).catch(() => {})
              },
              ...(message.options.customCoverage && options.allowCoverage
                ? {
                    ...(options.onCustomCoverageSuite
                      ? {
                          onCustomCoverageSuite: (
                            completion: CustomCoverageCompletion
                          ) =>
                            options.onCustomCoverageSuite!(
                              message.artifact,
                              message.options,
                              completion
                            ),
                        }
                      : {}),
                    onCustomCoverage: (completion: CustomCoverageCompletion) =>
                      publish({
                        type: 'execution-broker-response',
                        id: message.id,
                        action: 'custom-coverage',
                        completion,
                      }),
                  }
                : {}),
              ...(message.options.coverage && options.allowCoverage
                ? {
                    onCoverage: (completion: TestCoverageCompletion) =>
                      publish({
                        type: 'execution-broker-response',
                        id: message.id,
                        action: 'coverage',
                        completion,
                      }),
                  }
                : {}),
            },
            { ...message.env },
            options.browserProjects?.find((project) =>
              isDeepStrictEqual(project.profile, message.artifact.profile)
            ),
            options.browserApplications?.find((application) =>
              isDeepStrictEqual(application.profile, message.artifact.profile)
            ),
            options.onSnapshotUpdates
              ? (file, updates) =>
                  options.onSnapshotUpdates!(
                    message.artifact.entryId,
                    file,
                    updates,
                    message.artifact.sourceHash
                  )
              : undefined,
            options.onWorkerLaunched
              ? () =>
                  options.onWorkerLaunched!({
                    entryId: message.artifact.entryId,
                    runId: message.options.runId,
                    revision: message.artifact.revision,
                  })
              : undefined
          )
          if (result.notExecuted !== undefined)
            throw new Error('A worker cannot authorize non-execution.')
          if (
            result.closedUserCancellation !== undefined &&
            (result.closedUserCancellation !== true ||
              message.artifact.kind !== 'browser' ||
              !options.userCancelSignal?.aborted ||
              request.controller.signal.aborted ||
              result.status !== 'passed')
          )
            throw new Error('Invalid closed Browser scheduling result.')
          executing = false
          request.leased = false
          await sealRuntimeConfiguration?.()
          // Ordered delivery keeps all output/cleanup events before the result.
          await publish({
            type: 'execution-broker-response',
            id: message.id,
            action: 'result',
            result,
          })
        } catch (error) {
          // An execute rejection can mean a process-group/cache cleanup failed.
          // Reporting it to the child must not later certify ownership closure.
          const certified =
            message.action === 'execute-cohort' &&
            isCohortExecutionClosedError(error)
          if (executing && !certified) cleanupFailures.push(error)
          if (certified) request.leased = false
          if (!closed && !transportFailure) {
            await publish({
              type: 'execution-broker-response',
              id: message.id,
              action: 'error',
              error: serializeDiagnostic(error, { phase: 'runtime' }),
              ...(certified
                ? {
                    ownershipClosed: true as const,
                    ...(error.cancelled ? { cancelled: true as const } : {}),
                  }
                : {}),
            })
          }
        } finally {
          active.delete(message.id)
        }
      })().catch((error) => {
        transportFailure ??= { error }
        abortAll(error)
      })
      return true
    },
    close(): Promise<void> {
      if (closing) return closing
      closed = true
      // An unresponsive compiler child may not drain IPC. Release transport
      // waits so the outer supervisor can terminate it after our workers close.
      releaseSends()
      options.signal.removeEventListener('abort', onAbort)
      abortAll(new Error('Execution broker closed'))
      closing = (async () => {
        // Each task settles only after B's real process/cache disposal, even if
        // the compiler child has disappeared and terminal IPC cannot be sent.
        await Promise.all([...active.values()].map((request) => request.task))
        ownershipClosed = cleanupFailures.length === 0
        const failures = [
          ...cleanupFailures,
          ...(transportFailure ? [transportFailure.error] : []),
        ]
        if (failures.length === 1) throw failures[0]
        if (failures.length)
          throw new AggregateError(failures, 'Execution broker cleanup failed')
      })()
      return closing
    },
  }
}

function remoteError(diagnostic: SerializedDiagnostic): Error {
  const options = diagnostic.cause
    ? { cause: remoteError(diagnostic.cause) }
    : undefined
  const error = diagnostic.errors
    ? new AggregateError(
        diagnostic.errors.map(remoteError),
        diagnostic.message,
        options
      )
    : new Error(diagnostic.message, options)
  if (diagnostic.name) error.name = diagnostic.name
  if (diagnostic.stack) error.stack = diagnostic.stack
  return error
}

/** The fresh compiler child delegates execution and retains its artifact lease. */
export function createExecutionBrokerClient(options: {
  send(message: ExecutionBrokerRequest): Promise<void>
  allowCoverage?: boolean
  allowCohorts?: boolean
}) {
  interface PendingBase {
    reject(error: unknown): void
    onEvent(event: ResultEvent): void
    signal: AbortSignal
    onAbort(): void
    failure?: { error: unknown }
    onCoverage?: ExecuteTestOptions['onCoverage']
    onCustomCoverage?: ExecuteTestOptions['onCustomCoverage']
    coverage: Promise<void>
  }
  type Pending = PendingBase &
    (
      | { kind: 'file'; resolve(result: TestExecutionResult): void }
      | { kind: 'source-analysis'; resolve(): void }
      | {
          kind: 'cohort'
          entryIds: readonly string[]
          resolve(result: readonly TestExecutionResult[]): void
        }
    )
  const pending = new Map<string, Pending>()
  let disconnected: Error | undefined

  function disconnect(error: Error) {
    disconnected ??= error
    for (const request of pending.values()) {
      request.signal.removeEventListener('abort', request.onAbort)
      request.reject(request.failure?.error ?? error)
    }
    pending.clear()
  }

  const execute: ExecuteTest = (artifact, executionOptions) => {
    if (disconnected) return Promise.reject(disconnected)
    if (executionOptions.onCustomCoverageSuite)
      return Promise.reject(
        new Error(
          'Custom coverage suite hooks require the parent broker owner.'
        )
      )
    if (
      !options.allowCoverage &&
      (executionOptions.coverage ||
        executionOptions.onCoverage ||
        executionOptions.customCoverage ||
        executionOptions.onCustomCoverage)
    ) {
      return Promise.reject(
        new Error('Watch execution does not support coverage')
      )
    }
    const id = randomUUID()
    const {
      signal,
      userCancelSignal: _userCancelSignal,
      onEvent,
      onCoverage: _onCoverage,
      onCustomCoverage: _onCustomCoverage,
      onCustomCoverageSuite: _onCustomCoverageSuite,
      onSnapshotUpdates: _onSnapshotUpdates,
      ...serializable
    } = executionOptions
    return new Promise<TestExecutionResult>((resolve, reject) => {
      let sent = Promise.resolve()
      let cancellationSent = false
      function cancel() {
        if (cancellationSent) return
        cancellationSent = true
        // Send cancellation after the launch request, then keep waiting for the
        // authoritative result. Early rejection could release the artifact.
        sent = sent.then(() => {
          if (disconnected) throw disconnected
          return options.send({
            type: 'execution-broker-request',
            action: 'cancel',
            id,
          })
        })
        void sent.catch((error) => disconnect(asError(error)))
      }
      const request: Pending = {
        kind: 'file',
        resolve,
        reject,
        onEvent,
        signal,
        onAbort: cancel,
        onCoverage: executionOptions.onCoverage,
        onCustomCoverage: executionOptions.onCustomCoverage,
        coverage: Promise.resolve(),
      }
      pending.set(id, request)
      sent = Promise.resolve().then(() => {
        if (disconnected) throw disconnected
        return options.send({
          type: 'execution-broker-request',
          id,
          action: 'execute',
          artifact,
          options: serializable,
          env: { ...process.env },
        })
      })
      void sent.catch((error) => disconnect(asError(error)))
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
  }

  /** Wait for the parent to validate retained compiler bytes before lease disposal. */
  const analyzeCoverageSource = (
    compiled: CompiledCoverageSource,
    signal: AbortSignal
  ): Promise<void> => {
    if (disconnected) return Promise.reject(disconnected)
    if (!options.allowCoverage)
      return Promise.reject(
        new Error('Unrequested compiler coverage source analysis')
      )
    const id = randomUUID()
    return new Promise<void>((resolve, reject) => {
      let sent = Promise.resolve(),
        cancellationSent = false
      const cancel = () => {
        if (cancellationSent) return
        cancellationSent = true
        sent = sent.then(() => {
          if (disconnected) throw disconnected
          return options.send({
            type: 'execution-broker-request',
            action: 'cancel',
            id,
          })
        })
        void sent.catch((error) => disconnect(asError(error)))
      }
      pending.set(id, {
        kind: 'source-analysis',
        resolve,
        reject,
        signal,
        onAbort: cancel,
        onEvent: () => {},
        coverage: Promise.resolve(),
      })
      sent = Promise.resolve().then(() => {
        if (disconnected) throw disconnected
        return options.send({
          type: 'execution-broker-request',
          id,
          action: 'source-analysis',
          compiled,
        })
      })
      void sent.catch((error) => disconnect(asError(error)))
      signal.addEventListener('abort', cancel, { once: true })
      if (signal.aborted) cancel()
    })
  }

  const executeCohort: ExecuteTestCohort = (cohort, executionOptions) => {
    if (disconnected) return Promise.reject(disconnected)
    if (!options.allowCohorts)
      return Promise.reject(
        new Error('Watch execution does not support shared worker cohorts')
      )
    const first = executionOptions[0]
    if (
      !first ||
      executionOptions.length !== cohort.artifacts.length ||
      executionOptions.some(
        (value) =>
          value.signal !== first.signal ||
          value.userCancelSignal !== undefined ||
          value.runId !== first.runId ||
          value.projectDir !== first.projectDir ||
          value.coverage ||
          value.customCoverage ||
          value.onCustomCoverage ||
          value.onCustomCoverageSuite ||
          value.onCoverage
      )
    )
      return Promise.reject(
        new Error(
          'Shared worker cohorts require matching execution options without coverage'
        )
      )
    const id = randomUUID()
    const serializable = executionOptions.map(
      ({
        signal: _signal,
        userCancelSignal: _userCancelSignal,
        onEvent: _onEvent,
        onCoverage: _onCoverage,
        onCustomCoverage: _onCustomCoverage,
        onCustomCoverageSuite: _onCustomCoverageSuite,
        onSnapshotUpdates: _onSnapshotUpdates,
        ...value
      }) => value
    )
    const byEntry = new Map(
      executionOptions.map((value) => [value.entry.id, value])
    )
    return new Promise<readonly TestExecutionResult[]>((resolve, reject) => {
      let sent = Promise.resolve()
      let cancellationSent = false
      function cancel() {
        if (cancellationSent) return
        cancellationSent = true
        sent = sent.then(() => {
          if (disconnected) throw disconnected
          return options.send({
            type: 'execution-broker-request',
            action: 'cancel',
            id,
          })
        })
        void sent.catch((error) => disconnect(asError(error)))
      }
      const request: Pending = {
        kind: 'cohort',
        entryIds: executionOptions.map((value) => value.entry.id),
        resolve,
        reject,
        signal: first.signal,
        onAbort: cancel,
        coverage: Promise.resolve(),
        onEvent(event) {
          const entryId =
            event.type === 'file-start'
              ? event.entry.id
              : 'entryId' in event
                ? event.entryId
                : undefined
          const owner = entryId ? byEntry.get(entryId) : first
          if (!owner)
            throw new Error('Unknown shared cohort broker event owner')
          owner.onEvent(event)
        },
      }
      pending.set(id, request)
      sent = Promise.resolve().then(() => {
        if (disconnected) throw disconnected
        return options.send({
          type: 'execution-broker-request',
          id,
          action: 'execute-cohort',
          cohort,
          options: serializable,
          env: { ...process.env },
        })
      })
      void sent.catch((error) => disconnect(asError(error)))
      first.signal.addEventListener('abort', cancel, { once: true })
      if (first.signal.aborted) cancel()
    })
  }

  return {
    execute,
    analyzeCoverageSource,
    executeCohort,
    disconnect,
    handle(value: unknown): boolean {
      if (
        !value ||
        typeof value !== 'object' ||
        !('type' in value) ||
        value.type !== 'execution-broker-response'
      ) {
        return false
      }
      const message = value as ExecutionBrokerResponse
      if (typeof message.id !== 'string' || !message.id) {
        throw new Error('Invalid execution broker response identity')
      }
      const request = pending.get(message.id)
      if (!request) return true
      if (
        request.kind === 'source-analysis' &&
        message.action !== 'source-analysis-result' &&
        message.action !== 'error'
      )
        throw new Error(
          'Runtime broker response cannot complete compiler coverage analysis'
        )
      if (
        message.action === 'source-analysis-result' &&
        Object.keys(message).some(
          (key) => !['type', 'id', 'action'].includes(key)
        )
      )
        throw new Error(
          'Compiler coverage analysis acknowledgement cannot contain runtime facts'
        )
      if (message.action === 'custom-coverage') {
        request.coverage = request.coverage
          .then(async () => {
            if (!options.allowCoverage || !request.onCustomCoverage)
              throw new Error('Unexpected broker custom coverage completion')
            await request.onCustomCoverage(message.completion)
          })
          .catch((error) => {
            request.failure ??= { error }
            request.onAbort()
          })
        return true
      }
      if (message.action === 'coverage') {
        request.coverage = request.coverage
          .then(async () => {
            if (!options.allowCoverage || !request.onCoverage)
              throw new Error('Unexpected broker coverage completion')
            await request.onCoverage(message.completion)
          })
          .catch((error) => {
            request.failure ??= { error }
            request.onAbort()
          })
        return true
      }
      if (message.action === 'event') {
        try {
          request.onEvent(message.event)
        } catch (error) {
          request.failure ??= { error }
          request.onAbort()
        }
        return true
      }
      if (
        message.action !== 'result' &&
        message.action !== 'cohort-result' &&
        message.action !== 'source-analysis-result' &&
        message.action !== 'error'
      ) {
        throw new Error('Invalid execution broker response action')
      }
      void request.coverage.then(() => {
        pending.delete(message.id)
        request.signal.removeEventListener('abort', request.onAbort)
        if (message.action === 'error') {
          const remote = remoteError(message.error)
          const cancelled = message.cancelled === true && request.signal.aborted
          const error =
            request.kind === 'cohort' && message.ownershipClosed === true
              ? new CohortExecutionClosedError(
                  cancelled ? request.signal.reason : remote,
                  cancelled
                )
              : remote
          request.reject(
            request.failure
              ? new AggregateError(
                  [request.failure.error, error],
                  'Test reporting and execution failed'
                )
              : error
          )
        } else if (request.failure) {
          request.reject(request.failure.error)
        } else if (
          message.action === 'source-analysis-result' &&
          request.kind === 'source-analysis'
        ) {
          if (request.signal.aborted) request.reject(request.signal.reason)
          else request.resolve()
        } else if (message.action === 'result' && request.kind === 'file') {
          request.resolve(message.result)
        } else if (
          message.action === 'cohort-result' &&
          request.kind === 'cohort'
        ) {
          if (
            !Array.isArray(message.results) ||
            message.results.length !== request.entryIds.length ||
            message.results.some(
              (result, index) => result.entryId !== request.entryIds[index]
            )
          )
            request.reject(new Error('Mismatched shared cohort broker results'))
          else request.resolve(message.results)
        } else {
          request.reject(new Error('Mismatched execution broker result kind'))
        }
      })
      return true
    },
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/** Browser leases remain in this parent until its actual execution worker closes. */
async function executeBrokerFile(
  artifact: CompiledTestArtifact,
  options: ExecuteTestOptions,
  environment: NodeJS.ProcessEnv,
  project:
    | Pick<
        DiscoveredTestProject,
        | 'profile'
        | 'entries'
        | 'browserFixtures'
        | 'browserEngine'
        | 'browserHeadless'
        | 'includeTaskLocation'
      >
    | undefined,
  application: BrowserApplicationOwnership | undefined,
  snapshotUpdates?: Parameters<typeof executeWithEnvironment>[3],
  onWorkerLaunched?: () => void
): Promise<TestExecutionResult> {
  if (
    artifact.profile.environment !== 'browser' ||
    artifact.kind === 'browser' ||
    options.collectOnly
  )
    return executeWithEnvironment(
      artifact,
      options,
      environment,
      snapshotUpdates,
      onWorkerLaunched
    )
  if (
    artifact.kind !== 'node' ||
    !artifact.applicationServer ||
    artifact.applicationServer.lockDistDir !== true ||
    artifact.applicationServer.mode !== artifact.profile.mode ||
    !project ||
    project.profile.environment !== artifact.profile.environment ||
    project.profile.mode !== artifact.profile.mode ||
    !application ||
    application.projectDir !== options.projectDir ||
    !isDeepStrictEqual(application.profile, artifact.profile) ||
    application.distDir !== artifact.applicationServer.distDir ||
    application.lockDistDir !== artifact.applicationServer.lockDistDir
  )
    throw new Error(
      'Browser broker requires compiler-resolved application server ownership.'
    )
  let server: import('../browser/server').ApplicationServer | undefined
  let host: import('../browser/host').BrowserHost | undefined
  const errors: unknown[] = []
  let result: TestExecutionResult | undefined
  let acquisition = true
  let cleanCancellation = false
  let ApplicationServerError:
    | typeof import('../browser/server').ApplicationServerError
    | undefined
  const started = performance.now()
  let outputDir: string | undefined
  let retainedOutput = false
  const retain = (
    attachments: import('../browser/server').ApplicationServerAttachment[]
  ) => {
    for (const attachment of attachments) {
      retainedOutput = true
      options.onEvent({
        version: 1,
        runId: options.runId,
        timestamp: Date.now(),
        type: 'attachment',
        entryId: artifact.entryId,
        revision: artifact.revision,
        attachment,
      })
    }
  }
  try {
    outputDir = await mkdtemp(
      join(tmpdir(), `next-test-browser-${options.runId}-`)
    )
    const applicationModule = await import('../browser/server.js')
    const { createApplicationServer } = applicationModule
    ApplicationServerError = applicationModule.ApplicationServerError
    server = await createApplicationServer({
      projectDir: options.projectDir,
      mode: artifact.applicationServer.mode,
      outputLockEnabled: artifact.applicationServer.lockDistDir,
      distDir: artifact.applicationServer.distDir,
      browserFixtures: project.browserFixtures,
      outputDir,
      signal: options.signal,
    })
    retain(server.attachments)
    options.signal.throwIfAborted()
    const { createBrowserHost } = await import('../browser/host.js')
    host = await createBrowserHost({
      projectDir: options.projectDir,
      signal: options.signal,
    })
    options.signal.throwIfAborted()
    acquisition = false
    result = await executeWithEnvironment(
      artifact,
      {
        ...options,
        browser: {
          wsEndpoint: host.wsEndpoint,
          baseURL: server.baseURL,
          outputDir,
          ...(server.componentHost
            ? { componentHost: server.componentHost }
            : {}),
        },
      },
      environment,
      snapshotUpdates
    )
  } catch (error) {
    if (ApplicationServerError && error instanceof ApplicationServerError)
      retain(error.attachments)
    cleanCancellation =
      acquisition &&
      options.signal.aborted &&
      (error === options.signal.reason ||
        (!!ApplicationServerError &&
          error instanceof ApplicationServerError &&
          error.errors.length === 1 &&
          error.errors[0] === options.signal.reason))
    if (!cleanCancellation) errors.push(error)
  } finally {
    // Cancellation never preempts driver teardown; acquisition signals only
    // cancel startup. Every resource remains awaited even after another fails.
    for (const resource of [host, server]) {
      try {
        await resource?.dispose()
      } catch (error) {
        errors.push(error)
      }
    }
    // Reported server logs and attempt artifacts remain available after shutdown.
    // An unused root from failed acquisition has no published artifact lifetime.
    if (outputDir && !retainedOutput) {
      try {
        await rm(outputDir, { recursive: true, force: true })
      } catch (error) {
        errors.push(error)
      }
    }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length)
    throw new AggregateError(errors, 'Browser broker cleanup failed.')
  return cleanCancellation
    ? {
        entryId: artifact.entryId,
        status: 'cancelled',
        durationMs: performance.now() - started,
      }
    : result!
}
