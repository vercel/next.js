import type {
  ArtifactAllocationResponse,
  WatchProcessMessage,
  WatchProcessRequest,
  WatchProcessResult,
} from './watch-process'
import { randomUUID } from 'crypto'
import type { WatchDirectories } from './incremental/watch-files'
import { getTestRunLockPath } from './run-lock'
import { serializeDiagnostic } from './reporting/diagnostics'

class QueuedModuleTransportFailure extends AggregateError {}

const controller = new AbortController()
const userCancellation = new AbortController()
let userCancellationAuthorized = false
let started = false
const allocations = new Map<
  string,
  {
    resolve(value: { stagingDir: string; rootDir: string }): void
    reject(error: Error): void
  }
>()
let broker:
  | ReturnType<typeof import('./execution/broker').createExecutionBrokerClient>
  | undefined

function allocateArtifact(
  parentDir: string
): Promise<{ stagingDir: string; rootDir: string }> {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    allocations.set(id, { resolve, reject })
    if (!process.connected) {
      allocations.delete(id)
      reject(new Error('Test planner coordinator disconnected.'))
      return
    }
    process.send!(
      { type: 'artifact-allocation-request', id, parentDir },
      (error: Error | null) => {
        if (error) {
          allocations.delete(id)
          reject(error)
        }
      }
    )
  })
}

async function run(request: WatchProcessRequest): Promise<WatchProcessResult> {
  if (request.operation === 'plan') {
    const { planSourceSelection } = await import(
      './incremental/source-planner.js'
    )
    const plan = await planSourceSelection(
      request.projectDir,
      request.projects,
      request.certifiedTestConfig,
      controller.signal,
      allocateArtifact,
      request.retainedGlobalSetup
    )
    return { operation: 'plan', plan }
  }
  if (request.operation === 'run') {
    userCancellationAuthorized = request.userCancellation === true
    const { createExecutionBrokerClient } = await import(
      './execution/broker.js'
    )
    broker = createExecutionBrokerClient({
      allowCoverage:
        request.isolatedProfile === true ||
        (request.watchCoverage === true && !!request.standardCoverageOptions),
      allowCohorts: request.isolatedProfile === true,
      send: (message) =>
        new Promise<void>((sent, failed) => {
          if (!process.connected)
            return failed(new Error('Test watch coordinator disconnected.'))
          process.send!(message, (error: Error | null) =>
            error ? failed(error) : sent()
          )
        }),
    })
    const { runTests } = await import('./orchestrator.js')
    const queueWrites: Promise<void>[] = []
    const queueWriteFailures: unknown[] = []
    let queueAbortReason: Error | undefined
    let executionRejected = false
    let executionFailure: unknown
    const result = await runTests(request.projectDir, request.projects, {
      ...(request.captureOneShotV8CollectionRestoration === true &&
      request.isolatedProfile === true &&
      request.watchCoverage !== true &&
      request.userCancellation === undefined
        ? { captureOneShotV8CollectionRestoration: true as const }
        : {}),
      ...(request.captureOneShotV8ReadOnlySnapshots === true &&
      request.isolatedProfile === true &&
      request.watchCoverage !== true &&
      request.userCancellation === undefined &&
      request.snapshotUpdateMode === 'none'
        ? { captureOneShotV8ReadOnlySnapshots: true as const }
        : {}),
      ...(request.captureModuleQueued === true
        ? {
            onModuleQueued(entry) {
              queueWrites.push(
                new Promise<void>((resolve, reject) => {
                  if (!process.connected)
                    return reject(
                      new Error('Test watch coordinator disconnected.')
                    )
                  process.send!(
                    { type: 'module-queued', entryId: entry.id },
                    (error: Error | null) => (error ? reject(error) : resolve())
                  )
                }).catch((error: unknown) => {
                  queueWriteFailures.push(error)
                  if (!controller.signal.aborted) {
                    queueAbortReason = new Error(
                      'Queued module transport aborted execution.',
                      { cause: error }
                    )
                    controller.abort(queueAbortReason)
                  }
                })
              )
            },
          }
        : {}),
      ...(request.compilerTransforms
        ? { compilerTransforms: request.compilerTransforms }
        : {}),
      signal: controller.signal,
      ...(userCancellationAuthorized
        ? { userCancelSignal: userCancellation.signal }
        : {}),
      collectOnly: request.collectOnly,
      ...(request.preparePublicSnapshots === true
        ? {
            preparePublicSnapshots: true as const,
            onSnapshotPreparationFailure(
              failure: import('./execution/snapshot-preparation').SnapshotPreparationFailure
            ) {
              if (
                request.isolatedProfile !== true ||
                request.watchCoverage ||
                request.userCancellation
              )
                throw new Error(
                  'Snapshot preparation forwarding requires its actual one-shot parent.'
                )
              return new Promise<void>((resolve, reject) => {
                if (!process.connected)
                  return reject(
                    new Error('Test watch coordinator disconnected.')
                  )
                process.send!(
                  { type: 'snapshot-preparation-failure', failure },
                  (error: Error | null) => (error ? reject(error) : resolve())
                )
              })
            },
          }
        : {}),
      ...(request.captureJUnitSuiteTasks === true
        ? { captureJUnitSuiteTasks: true as const }
        : {}),
      captureTaskResults: request.captureTaskResults,
      ...(request.captureModuleCollected === true
        ? { captureModuleCollected: true as const }
        : {}),
      inspect: request.inspect,
      inspectBrk: request.inspectBrk,
      testNamePattern: request.testNamePattern,
      passWithNoTests: request.passWithNoTests,
      bailFailures: request.bailFailures,
      updateSnapshots: request.updateSnapshots,
      snapshotUpdateMode: request.snapshotUpdateMode,
      maxWorkers: request.maxWorkers,
      coverage: request.coverage,
      standardCoverageOptions: request.standardCoverageOptions,
      ...(request.istanbulSourcePlan
        ? {
            istanbulSourcePlan: request.istanbulSourcePlan,
            ...(request.coverageInputs
              ? { coverageInputs: request.coverageInputs }
              : {}),
          }
        : {}),
      ...(request.standardCoverageOptions &&
      request.standardCoverageOptions.provider !== 'istanbul'
        ? {
            coverageSourcePlan: request.coverageSourcePlan,
            nodeTypeScriptImportCoverage:
              request.isolatedProfile === true &&
              request.watchCoverage !== true,
            runtimeConfigurationPlan: request.runtimeConfigurationPlan,
            onCoverageSource: broker.analyzeCoverageSource,
          }
        : {}),
      customCoverageRequests: request.customCoverageRequests,
      customCoverageDisabled: request.customCoverageDisabled,
      execute: broker.execute,
      brokerOwnsBrowser: true,
      ...(request.isolatedProfile === true
        ? { executeCohort: broker.executeCohort }
        : {}),
      allocateArtifact: (parentDir) =>
        new Promise((resolve, reject) => {
          const id = randomUUID()
          allocations.set(id, { resolve, reject })
          if (!process.connected) {
            allocations.delete(id)
            reject(new Error('Test watch coordinator disconnected.'))
            return
          }
          process.send!(
            { type: 'artifact-allocation-request', id, parentDir },
            (error: Error | null) => {
              if (error) {
                allocations.delete(id)
                reject(error)
              }
            }
          )
        }),
      write: () => {},
      onEvent: (event) => {
        if (!process.connected)
          throw new Error('Test watch coordinator disconnected.')
        process.send!({ type: 'event', event }, (error: Error | null) => {
          if (error) {
            process.exitCode = 1
            controller.abort(error)
          }
        })
      },
    })
      .catch((error: unknown) => {
        executionRejected = true
        executionFailure = error
      })
      .finally(() => Promise.all(queueWrites))
    if (queueWriteFailures.length) {
      // Only this private abort marker identifies the causal observation of a
      // write already retained below. Reused authored Error values stay separate.
      const independentExecutionFailure =
        executionRejected &&
        (queueAbortReason === undefined ||
          executionFailure !== queueAbortReason)
      throw new QueuedModuleTransportFailure(
        [
          ...(independentExecutionFailure ? [executionFailure] : []),
          ...queueWriteFailures,
        ],
        independentExecutionFailure
          ? 'Test execution and queued module transport failed.'
          : 'Queued module transport failed.'
      )
    }
    if (executionRejected) throw executionFailure
    return { operation: 'run', result: result! }
  }
  const modes = new Set(request.profiles.map((profile) => profile.mode))
  if (modes.size !== 1) throw new Error('Watch requires one compilation mode.')
  const mode = request.profiles[0].mode
  if (process.env.NODE_ENV && process.env.NODE_ENV !== mode) {
    throw new Error(
      `Selected test projects require NODE_ENV=${mode}; the current NODE_ENV conflicts with their Next compilation profile.`
    )
  }
  ;(process.env as any).NODE_ENV = mode
  const { resolveTestWatchOptions } = await import(
    './compiler/watch-options.js'
  )
  const directories: WatchDirectories = {
    directories: [],
    outputDirectories: [],
    outputFiles: [getTestRunLockPath(request.projectDir)],
    artifactDirectories: [],
  }
  for (const profile of request.profiles) {
    controller.signal.throwIfAborted()
    const metadata = await resolveTestWatchOptions(request.projectDir, profile)
    directories.directories = [...directories.directories, ...metadata.roots]
    directories.outputDirectories = [
      ...directories.outputDirectories,
      metadata.outputDir,
    ]
    directories.artifactDirectories = [
      ...directories.artifactDirectories!,
      {
        parentDirectory: metadata.artifactParentDir,
        basenamePrefixes: metadata.artifactBasenamePrefixes,
      },
    ]
  }
  return { operation: 'metadata', directories }
}

function finish(message: WatchProcessMessage) {
  process.removeListener('message', onMessage)
  if (process.connected)
    process.send!(message, (error: Error | null) => {
      if (error) process.exitCode = 1
      if (process.connected) process.disconnect()
    })
  else process.exitCode = 1
}

function onMessage(
  message:
    | { type: 'cancel' }
    | { type: 'user-cancel' }
    | { type: 'start'; request: WatchProcessRequest }
    | ArtifactAllocationResponse
) {
  if (broker?.handle(message)) return
  if (message.type === 'artifact-allocation-response') {
    const pending = allocations.get(message.id)
    if (!pending) return
    allocations.delete(message.id)
    if (message.error || !message.allocation)
      pending.reject(
        new Error(message.error ?? 'Missing watch artifact allocation.')
      )
    else pending.resolve(message.allocation)
    return
  }
  if (message.type === 'user-cancel') {
    if (userCancellationAuthorized)
      userCancellation.abort(
        new Error('Test watch scheduling cancelled by user.')
      )
    return
  }
  if (message.type === 'cancel') {
    controller.abort(new Error('Test watch generation cancelled.'))
    return
  }
  if (started) return
  started = true
  void run(message.request).then(
    (value) => finish({ type: 'result', value }),
    (error: unknown) =>
      finish({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Unknown watch process failure.',
        ...(error instanceof QueuedModuleTransportFailure &&
        message.request.operation === 'run' &&
        message.request.captureModuleQueued === true
          ? { queueFailure: serializeDiagnostic(error, { phase: 'runtime' }) }
          : {}),
      })
  )
}

process.on('message', onMessage)
process.once('disconnect', () => {
  const error = new Error('Test watch coordinator disconnected.')
  controller.abort(error)
  broker?.disconnect(error)
  for (const pending of allocations.values()) pending.reject(error)
  allocations.clear()
})
