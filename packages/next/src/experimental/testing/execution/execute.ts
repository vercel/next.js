import {
  assertCustomCoverageRequest,
  assertCustomCoverageCompletion,
  captureCustomCoverageClosure,
} from '../coverage/custom-runtime'
import type { CustomCoverageCompletion } from '../coverage/custom-types'
import type {
  CompiledTestArtifact,
  ExecuteTest,
  ExecuteTestOptions,
  TestCoverageCompletion,
  AnyTestCoverageCompletion,
  IstanbulCoverageCompletion,
  TestFileCollection,
  TestExecutionResult,
} from '../contracts'
import type { FileResult } from '../reporting/events'
import type { WorkerInput, WorkerMessage } from './protocol'
import { serializeDiagnostic } from '../reporting/diagnostics'
import { runTestProcess } from './process'
import { assertTestFileCollection } from './collection'
import { assertArtifactProfile } from './artifact-profile'
import {
  assertRuntimeModuleCompletion,
  type RuntimeModuleCompletion,
} from './completed-module'
import { withFileCacheDirectory } from './file-cache'
import { assertNodeProjectEnvironment } from './project-env'
import {
  assertCoverageRequest,
  assertCoverageCompletion,
  createCoverageAttemptTracker,
} from './coverage'
import {
  commitSnapshotUpdates,
  resolveSnapshotUpdateMode,
  type SnapshotUpdate,
} from '../assertions/snapshots'

export const execute: ExecuteTest = (artifact, options) =>
  executeWithEnvironment(artifact, options, process.env)

/** Private broker entry: the compiler child's resolved environment stays private. */
export async function executeWithEnvironment(
  artifact: CompiledTestArtifact,
  options: ExecuteTestOptions,
  environment: NodeJS.ProcessEnv,
  deferSnapshotUpdates?: (
    file: string,
    updates: SnapshotUpdate[]
  ) => Promise<void>,
  /** Runs in the actual fork owner, before its launch message is sent. */
  onWorkerLaunched?: () => void
): Promise<TestExecutionResult> {
  const started = performance.now()
  if (
    options.includeTaskLocation !== undefined &&
    typeof options.includeTaskLocation !== 'boolean'
  )
    throw new TypeError('includeTaskLocation must be a boolean.')
  if (options.captureCompletedModuleResult && options.collectOnly)
    throw new Error('Module completion capture requires actual execution.')
  if (
    options.browserHeadless !== undefined &&
    (artifact.kind !== 'browser' ||
      artifact.profile.browserClient !== true ||
      typeof options.browserHeadless !== 'boolean')
  )
    throw new Error(
      'Browser headless selection requires an actual Browser client artifact and boolean mode.'
    )
  if (
    options.browserEngine !== undefined &&
    (artifact.kind !== 'browser' ||
      (options.browserEngine !== 'chromium' &&
        options.browserEngine !== 'firefox' &&
        options.browserEngine !== 'webkit'))
  )
    throw new Error(
      'Browser engine selection requires an actual Chromium, Firefox, or WebKit client artifact.'
    )
  if (
    options.collectOnly &&
    (options.coverage || resolveSnapshotUpdateMode(options) !== 'none')
  )
    throw new Error('Collection cannot request coverage or snapshot updates.')
  const snapshotUpdateMode = resolveSnapshotUpdateMode(options)
  const browserUserCancellation =
    options.userCancelSignal !== undefined &&
    artifact.kind === 'browser' &&
    artifact.profile.browserClient === true &&
    !options.coverage &&
    !options.customCoverage &&
    !options.collectOnly &&
    snapshotUpdateMode !== 'all'
  if (
    options.userCancelSignal &&
    !browserUserCancellation &&
    (!options.coverage ||
      options.customCoverage ||
      options.collectOnly ||
      snapshotUpdateMode === 'all' ||
      artifact.kind !== 'node' ||
      artifact.profile.environment !== 'node' ||
      artifact.cohort)
  )
    throw new Error(
      'Scheduling cancellation requires isolated ordinary Node coverage without snapshot writes.'
    )
  options = {
    ...options,
    snapshotUpdateMode,
    updateSnapshots: snapshotUpdateMode !== 'none',
  }
  if (
    (options.coverage?.kind === 'node-istanbul' ||
      options.onIstanbulCoverage) &&
    artifact.kind !== 'node'
  )
    throw new Error('Istanbul coverage requires a Node execution artifact.')
  if (artifact.kind === 'browser') {
    let launched = false
    return (await import('../client/execute.js')).executeClient(artifact, {
      ...options,
      ...(options.userCancelSignal && onWorkerLaunched
        ? {
            onEvent(event) {
              if (!launched && event.type === 'case-start') {
                launched = true
                onWorkerLaunched()
              }
              options.onEvent(event)
            },
          }
        : {}),
      ...(options.browserEngine === 'firefox' || options.userCancelSignal
        ? { testFrame: true }
        : {}),
      ...(deferSnapshotUpdates
        ? { onSnapshotUpdates: deferSnapshotUpdates }
        : {}),
    })
  }
  assertNodeProjectEnvironment(artifact, options)
  const {
    onEvent,
    onCoverage,
    onIstanbulCoverage,
    onCustomCoverage,
    onCustomCoverageSuite,
    onSnapshotUpdates,
    userCancelSignal,
    signal,
    ...workerOptions
  } = options
  if (options.coverage && snapshotUpdateMode === 'all') {
    throw new Error('Coverage and snapshot updates cannot run together')
  }
  assertCoverageRequest(artifact, options)
  assertCustomCoverageRequest(artifact, options)
  assertArtifactProfile(artifact, options.entry)
  const assertCustomClosure = options.customCoverage
    ? await captureCustomCoverageClosure(artifact, options.entry)
    : undefined
  const attempts = createCoverageAttemptTracker({
    deferSettledSuiteErrors: options.coverage?.kind === 'node-istanbul',
    ...(options.coverage?.kind === 'node-istanbul'
      ? {
          deferSettledFileErrors: true,
          fileErrorOwner: {
            runId: options.runId,
            entryId: artifact.entryId,
            revision: artifact.revision,
          },
        }
      : {}),
    deferNativeRejections:
      options.coverage !== undefined &&
      options.customCoverage === undefined &&
      artifact.kind === 'node' &&
      artifact.profile.environment === 'node',
  })
  const envelope = () => ({
    version: 1 as const,
    runId: options.runId,
    timestamp: Date.now(),
  })
  onEvent({
    ...envelope(),
    type: 'file-start',
    entry: options.entry,
    revision: artifact.revision,
  })
  if (options.testNamePattern !== undefined) {
    // Validate before starting a worker or evaluating application code.
    new RegExp(options.testNamePattern)
  }
  if (
    !options.collectOnly &&
    (artifact.profile.environment === 'browser') !==
      (options.browser !== undefined)
  ) {
    throw new Error(
      'Browser profiles require matching parent-owned browser and server leases'
    )
  }
  let collection: TestFileCollection | undefined
  let moduleCompletion: RuntimeModuleCompletion | undefined
  let moduleHostCleanupComplete: boolean | undefined
  let parentModuleHandoffFailed = false
  const moduleFailures = options.captureCompletedModuleResult
    ? ([] as unknown[])
    : undefined
  let result: FileResult | undefined
  let snapshotUpdates: SnapshotUpdate[] | undefined
  let coverage: AnyTestCoverageCompletion | undefined
  let customCoverage: CustomCoverageCompletion | undefined
  let customSuite: Promise<void> | undefined
  const exit = await withFileCacheDirectory(async (directory) => {
    const input: WorkerInput = {
      artifact,
      options: workerOptions,
      cacheScope: { type: 'file', directory },
      ...(onCustomCoverageSuite ? { customCoverageSuite: true as const } : {}),
      ...(userCancelSignal ? { userCancellation: true as const } : {}),
    }
    let send!: (message: unknown) => Promise<void>
    let terminateAfterCompletion!: () => void
    let userCancellationFinalized = false
    let userCancellationSend: Promise<void> | undefined
    const cancelByUser = () => {
      // onReady precedes the launch send. Queue this distinct request after it.
      userCancellationSend ??= Promise.resolve().then(() =>
        send({ type: 'user-cancel' })
      )
      void userCancellationSend.catch(() => {})
    }
    const processExit = await runTestProcess(require.resolve('./worker'), {
      cwd: options.projectDir,
      env: {
        ...environment,
        NODE_ENV: artifact.profile.mode,
        __NEXT_DEV_SERVER:
          artifact.profile.mode === 'development' ? 'true' : '',
      },
      input,
      inspect: options.inspect,
      inspectBrk: options.inspectBrk,
      signal,
      timeoutMs: options.fileTimeout,
      onReady(value, terminate) {
        onWorkerLaunched?.()
        send = value
        terminateAfterCompletion = terminate
        userCancelSignal?.addEventListener('abort', cancelByUser, {
          once: true,
        })
        if (userCancelSignal?.aborted) cancelByUser()
      },
      onMessage(value) {
        if (!value || typeof value !== 'object')
          throw new Error('Invalid test worker message')
        const message = value as WorkerMessage
        if (userCancellationFinalized)
          throw new Error('Test worker returned facts after finalization.')
        if (message.type === 'event') {
          if (
            message.event.version !== 1 ||
            message.event.runId !== options.runId ||
            !('entryId' in message.event) ||
            message.event.entryId !== artifact.entryId ||
            !('revision' in message.event) ||
            message.event.revision !== artifact.revision
          )
            throw new Error('Mismatched test worker event')
          if (
            options.collectOnly &&
            message.event.type !== 'diagnostic' &&
            message.event.type !== 'output'
          )
            throw new Error('Collection worker returned execution facts.')
          if (options.coverage || options.customCoverage)
            attempts.observe(message.event)
          if (moduleFailures && message.event.type === 'diagnostic')
            moduleFailures.push(message.event.diagnostic)
          onEvent(message.event)
        } else if (message.type === 'user-cancellation-finalized') {
          if (
            !userCancelSignal?.aborted ||
            signal.aborted ||
            message.version !== 1 ||
            message.runId !== options.runId ||
            message.entryId !== artifact.entryId ||
            message.revision !== artifact.revision ||
            !result ||
            result.status === 'cancelled' ||
            !coverage?.complete ||
            !attempts.complete ||
            (snapshotUpdateMode === 'new'
              ? !Array.isArray(snapshotUpdates) || snapshotUpdates.length !== 0
              : snapshotUpdates !== undefined)
          )
            throw new Error('Invalid user cancellation finalization.')
          terminateAfterCompletion()
          userCancellationFinalized = true
        } else if (message.type === 'custom-coverage-suite') {
          if (!options.customCoverage || !onCustomCoverageSuite || customSuite)
            throw new Error('Unrequested or duplicate custom coverage suite')
          assertCustomCoverageCompletion(
            message.completion,
            artifact,
            options.runId,
            options.customCoverage
          )
          if (!message.completion.complete || !attempts.complete)
            throw new Error('Custom coverage suite has incomplete attempts')
          customSuite = (async () => {
            let error: ReturnType<typeof serializeDiagnostic> | undefined
            try {
              signal.throwIfAborted()
              await onCustomCoverageSuite(message.completion)
              signal.throwIfAborted()
            } catch (failure) {
              error = serializeDiagnostic(failure, { phase: 'runtime' })
            }
            await send({
              type: 'custom-coverage-suite-received',
              runId: options.runId,
              entryId: artifact.entryId,
              revision: artifact.revision,
              ...(error ? { error } : {}),
            }).catch((failure) => {
              if (!signal.aborted) throw failure
            })
          })()
          // The process owner joins this task after the worker closes.
          void customSuite.catch(() => {})
        } else if (message.type === 'complete' && !result) {
          if (
            message.result?.entryId !== artifact.entryId ||
            !['passed', 'failed', 'cancelled'].includes(
              message.result.status
            ) ||
            !Number.isFinite(message.result.durationMs) ||
            message.result.durationMs < 0 ||
            'notExecuted' in message.result
          )
            throw new Error('Invalid test worker result')
          if (message.customCoverage !== undefined) {
            if (!options.customCoverage)
              throw new Error('Unsolicited custom coverage completion')
            assertCustomCoverageCompletion(
              message.customCoverage,
              artifact,
              options.runId,
              options.customCoverage
            )
            customCoverage = message.customCoverage
          }
          if (message.coverage !== undefined) {
            if (!options.coverage)
              throw new Error('Test worker returned unsolicited coverage')
            assertCoverageCompletion(message.coverage, artifact, options.runId)
            coverage = message.coverage
            attempts.observeCoverageCompletion(coverage.complete)
          }
          if (
            message.snapshotUpdates !== undefined &&
            !options.updateSnapshots
          ) {
            throw new Error('Test worker returned unsolicited snapshot updates')
          }
          if (message.collection !== undefined) {
            if (!options.collectOnly)
              throw new Error(
                'Test worker returned unsolicited collection facts.'
              )
            assertTestFileCollection(message.collection, artifact)
            collection = message.collection
          }
          if (
            options.collectOnly &&
            message.result.status === 'passed' &&
            !collection
          )
            throw new Error('Test worker completed without collection facts.')
          if (message.moduleCompletion !== undefined) {
            if (!options.captureCompletedModuleResult)
              throw new Error('Unsolicited private module completion.')
            assertRuntimeModuleCompletion(
              message.moduleCompletion,
              {
                version: 1,
                runId: options.runId,
                entryId: artifact.entryId,
                revision: artifact.revision,
              },
              message.result.status,
              moduleFailures!
            )
            moduleCompletion = message.moduleCompletion
          }
          if (message.moduleHostCleanupComplete !== undefined) {
            if (
              !options.captureCompletedModuleResult ||
              typeof message.moduleHostCleanupComplete !== 'boolean'
            )
              throw new Error('Invalid private module host cleanup completion.')
            moduleHostCleanupComplete = message.moduleHostCleanupComplete
          }
          result = message.result
          snapshotUpdates = message.snapshotUpdates
        } else throw new Error('Invalid test worker message')
      },
      onOutput(stream, chunk) {
        onEvent({
          ...envelope(),
          type: 'output',
          entryId: artifact.entryId,
          revision: artifact.revision,
          stream,
          text: chunk.toString('utf8'),
        })
      },
    }).finally(() =>
      userCancelSignal?.removeEventListener('abort', cancelByUser)
    )
    await userCancellationSend
    return { ...processExit, userCancellationFinalized }
  }).catch(async (error) => {
    try {
      await customSuite
    } catch (suiteError) {
      throw new AggregateError(
        [error, suiteError],
        'Test worker cleanup and custom coverage handoff failed'
      )
    }
    throw error
  })
  await customSuite
  const orderlyUserCancellation =
    exit.userCancellationFinalized &&
    userCancelSignal?.aborted &&
    !signal.aborted &&
    exit.reason === 'exit' &&
    exit.code === null &&
    exit.signal === 'SIGTERM'
  if (
    options.captureCompletedModuleResult &&
    exit.reason === 'exit' &&
    exit.code === 0 &&
    !signal.aborted &&
    !moduleCompletion
  )
    throw new Error('Test worker omitted requested private module completion.')
  if (
    options.captureCompletedModuleResult &&
    exit.reason === 'exit' &&
    exit.code === 0 &&
    !signal.aborted &&
    moduleCompletion &&
    moduleHostCleanupComplete === undefined
  )
    throw new Error(
      'Test worker omitted requested private module host cleanup completion.'
    )
  if (
    exit.reason === 'cancelled' ||
    (signal.aborted && exit.reason === 'exit' && exit.code === 0)
  ) {
    result = {
      entryId: artifact.entryId,
      status: result?.status === 'failed' ? 'failed' : 'cancelled',
      durationMs: 0,
    }
  } else if (
    exit.reason === 'timeout' ||
    (exit.code !== 0 && !orderlyUserCancellation) ||
    !result
  ) {
    onEvent({
      ...envelope(),
      type: 'diagnostic',
      entryId: artifact.entryId,
      revision: artifact.revision,
      diagnostic: serializeDiagnostic(
        new Error(
          exit.reason === 'timeout'
            ? 'Test file exceeded its process deadline.'
            : `Test worker exited without a clean result (code ${exit.code}, signal ${exit.signal}).`
        ),
        { phase: 'runtime' }
      ),
    })
    result = { entryId: artifact.entryId, status: 'failed', durationMs: 0 }
  }
  // Staged IPC bytes are provisional: a late worker failure, nonzero exit,
  // process-group cleanup failure or cache lease failure must prevent writes.
  // A completed ordinary Node body failure can still own valid snapshot bytes.
  // This code runs only after the actual process and its file resources close.
  if (
    options.updateSnapshots &&
    snapshotUpdates !== undefined &&
    (result?.status === 'passed' ||
      (result?.status === 'failed' &&
        artifact.kind === 'node' &&
        artifact.profile.environment === 'node')) &&
    exit.reason === 'exit' &&
    exit.code === 0 &&
    !userCancelSignal?.aborted &&
    !signal.aborted
  ) {
    try {
      const defer = deferSnapshotUpdates ?? onSnapshotUpdates
      if (defer) {
        await defer(options.entry.file, snapshotUpdates)
      } else {
        await commitSnapshotUpdates(options.entry.file, snapshotUpdates, {
          projectDir: options.projectDir,
          signal,
          sourceHash: artifact.sourceHash,
        })
      }
    } catch (error) {
      parentModuleHandoffFailed = true
      if (signal.aborted && error === signal.reason) {
        result = { ...result, status: 'cancelled' }
      } else {
        result = { ...result, status: 'failed' }
        onEvent({
          ...envelope(),
          type: 'diagnostic',
          entryId: artifact.entryId,
          revision: artifact.revision,
          diagnostic: serializeDiagnostic(error, { phase: 'cleanup' }),
        })
      }
    }
  }
  // Collection IPC is provisional until the worker, process group and cache
  // lease have closed. The awaited consumer remaps before A releases its maps.
  if (
    (options.coverage || options.customCoverage) &&
    exit.reason !== 'cancelled' &&
    !signal.aborted
  ) {
    try {
      if (
        exit.reason !== 'exit' ||
        (exit.code !== 0 && !orderlyUserCancellation) ||
        signal.aborted
      ) {
        throw new Error('Test coverage is incomplete after worker interruption')
      }
      if (options.coverage?.kind === 'node-istanbul' && coverage?.complete) {
        attempts.authorizeSettledSuiteErrors(coverage.settledSuiteErrors)
        attempts.authorizeSettledFileErrors(coverage.settledFileErrors)
      }
      if (!attempts.complete)
        throw new Error('Test coverage has incomplete attempts or cleanup')
      if (options.customCoverage) {
        await assertCustomClosure!()
        assertCustomCoverageCompletion(
          customCoverage,
          artifact,
          options.runId,
          options.customCoverage
        )
        if (!customCoverage.complete)
          throw new Error(customCoverage.error.message)
        await onCustomCoverage!(customCoverage)
      } else {
        assertCoverageCompletion(coverage, artifact, options.runId)
        if (!coverage.complete) throw new Error(coverage.error.message)
        if (options.coverage?.kind === 'node-istanbul') {
          if (coverage.data.kind !== 'node-istanbul')
            throw new Error(
              'Istanbul request received a different coverage capture.'
            )
          await onIstanbulCoverage!(coverage as IstanbulCoverageCompletion)
        } else {
          if (coverage.data.kind === 'node-istanbul')
            throw new Error('V8 request received an Istanbul coverage capture.')
          await onCoverage!(coverage as TestCoverageCompletion)
        }
      }
      signal.throwIfAborted()
    } catch (error) {
      parentModuleHandoffFailed = true
      if (
        signal.aborted &&
        error === signal.reason &&
        result?.status !== 'failed'
      ) {
        result = { ...result!, status: 'cancelled' }
      } else {
        result = { ...result!, status: 'failed' }
        onEvent({
          ...envelope(),
          type: 'diagnostic',
          entryId: artifact.entryId,
          revision: artifact.revision,
          diagnostic: serializeDiagnostic(error, { phase: 'runtime' }),
        })
      }
    }
  }
  const finalResult = { ...result!, durationMs: performance.now() - started }
  onEvent({ ...envelope(), type: 'file-end', ...finalResult })
  const terminalResult =
    collection &&
    options.collectOnly &&
    finalResult.status === 'passed' &&
    exit.reason === 'exit' &&
    exit.code === 0 &&
    !signal.aborted
      ? { ...finalResult, collection }
      : finalResult
  if (!options.captureCompletedModuleResult) return terminalResult
  const closed =
    artifact.kind === 'node' &&
    artifact.profile.environment === 'node' &&
    moduleCompletion !== undefined &&
    moduleHostCleanupComplete === true &&
    exit.reason === 'exit' &&
    exit.code === 0 &&
    !signal.aborted &&
    !parentModuleHandoffFailed
  return {
    ...terminalResult,
    moduleExecution: closed
      ? { closed: true, completion: moduleCompletion! }
      : {
          closed: false,
          ...(moduleCompletion ? { completion: moduleCompletion } : {}),
        },
  }
}
