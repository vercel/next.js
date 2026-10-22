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
  TestFileCollection,
  TestExecutionResult,
} from '../contracts'
import type { FileResult } from '../reporting/events'
import type { WorkerInput, WorkerMessage } from './protocol'
import { serializeDiagnostic } from '../reporting/diagnostics'
import { runTestProcess } from './process'
import { assertTestFileCollection } from './collection'
import { assertArtifactProfile } from './artifact-profile'
import { withFileCacheDirectory } from './file-cache'
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
  ) => Promise<void>
): Promise<TestExecutionResult> {
  const started = performance.now()
  if (
    options.collectOnly &&
    (options.coverage || resolveSnapshotUpdateMode(options) !== 'none')
  )
    throw new Error('Collection cannot request coverage or snapshot updates.')
  const snapshotUpdateMode = resolveSnapshotUpdateMode(options)
  options = {
    ...options,
    snapshotUpdateMode,
    updateSnapshots: snapshotUpdateMode !== 'none',
  }
  if (artifact.kind === 'browser') {
    return (await import('../client/execute.js')).executeClient(artifact, {
      ...options,
      ...(deferSnapshotUpdates
        ? { onSnapshotUpdates: deferSnapshotUpdates }
        : {}),
    })
  }
  const {
    onEvent,
    onCoverage,
    onCustomCoverage,
    onCustomCoverageSuite,
    onSnapshotUpdates,
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
  let result: FileResult | undefined
  let snapshotUpdates: SnapshotUpdate[] | undefined
  let coverage: TestCoverageCompletion | undefined
  let customCoverage: CustomCoverageCompletion | undefined
  let customSuite: Promise<void> | undefined
  const exit = await withFileCacheDirectory(async (directory) => {
    const input: WorkerInput = {
      artifact,
      options: workerOptions,
      cacheScope: { type: 'file', directory },
      ...(onCustomCoverageSuite ? { customCoverageSuite: true as const } : {}),
    }
    let send!: (message: unknown) => Promise<void>
    return runTestProcess(require.resolve('./worker'), {
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
      onReady(value) {
        send = value
      },
      onMessage(value) {
        if (!value || typeof value !== 'object')
          throw new Error('Invalid test worker message')
        const message = value as WorkerMessage
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
          onEvent(message.event)
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
            message.result.durationMs < 0
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
    })
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
  if (
    exit.reason === 'cancelled' ||
    (signal.aborted && exit.reason === 'exit' && exit.code === 0)
  ) {
    result = {
      entryId: artifact.entryId,
      status: result?.status === 'failed' ? 'failed' : 'cancelled',
      durationMs: 0,
    }
  } else if (exit.reason === 'timeout' || exit.code !== 0 || !result) {
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
      if (exit.reason !== 'exit' || exit.code !== 0 || signal.aborted) {
        throw new Error('Test coverage is incomplete after worker interruption')
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
        await onCoverage!(coverage)
      }
      signal.throwIfAborted()
    } catch (error) {
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
  return collection &&
    options.collectOnly &&
    finalResult.status === 'passed' &&
    exit.reason === 'exit' &&
    exit.code === 0 &&
    !signal.aborted
    ? { ...finalResult, collection }
    : finalResult
}
