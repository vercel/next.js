import type {
  CompiledTestArtifact,
  ExecuteTest,
  ExecuteTestOptions,
  TestCoverageCompletion,
} from '../contracts'
import type { FileResult } from '../reporting/events'
import type { WorkerInput, WorkerMessage } from './protocol'
import { serializeDiagnostic } from '../reporting/diagnostics'
import { runTestProcess } from './process'
import { withFileCacheDirectory } from './file-cache'
import {
  assertCoverageRequest,
  assertCoverageCompletion,
  createCoverageAttemptTracker,
} from './coverage'
import {
  commitSnapshotUpdates,
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
): Promise<FileResult> {
  const started = performance.now()
  const { onEvent, onCoverage, signal, ...workerOptions } = options
  if (options.coverage && options.updateSnapshots) {
    throw new Error('Coverage and snapshot updates cannot run together')
  }
  assertCoverageRequest(artifact, options)
  const attempts = createCoverageAttemptTracker()
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
    options.updateSnapshots &&
    (artifact.profile.mode !== 'development' ||
      artifact.profile.environment === 'browser')
  ) {
    throw new Error(
      'Snapshot updates require a development Node or RSC profile'
    )
  }
  if (
    (artifact.profile.environment === 'browser') !==
    (options.browser !== undefined)
  ) {
    throw new Error(
      'Browser profiles require matching parent-owned browser and server leases'
    )
  }
  if (
    options.browser?.componentHost &&
    artifact.profile.mode !== 'development'
  ) {
    throw new Error('Browser component mounting requires a development profile')
  }
  let result: FileResult | undefined
  let snapshotUpdates: SnapshotUpdate[] | undefined
  let coverage: TestCoverageCompletion | undefined
  const exit = await withFileCacheDirectory(async (directory) => {
    const input: WorkerInput = {
      artifact,
      options: workerOptions,
      cacheScope: { type: 'file', directory },
    }
    return runTestProcess(require.resolve('./worker'), {
      cwd: options.projectDir,
      env: {
        ...environment,
        NODE_ENV: artifact.profile.mode,
        __NEXT_DEV_SERVER:
          artifact.profile.mode === 'development' ? 'true' : '',
      },
      input,
      signal,
      timeoutMs: options.fileTimeout,
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
          if (options.coverage) attempts.observe(message.event)
          onEvent(message.event)
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
          if (message.coverage !== undefined) {
            if (!options.coverage)
              throw new Error('Test worker returned unsolicited coverage')
            assertCoverageCompletion(message.coverage, artifact, options.runId)
            coverage = message.coverage
          }
          if (
            message.snapshotUpdates !== undefined &&
            !options.updateSnapshots
          ) {
            throw new Error('Test worker returned unsolicited snapshot updates')
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
    })
  })
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
  // A passing IPC payload is provisional: a late worker failure, nonzero exit,
  // process-group cleanup failure or cache lease failure must prevent writes.
  // This code runs only after the actual process and its file resources close.
  if (
    options.updateSnapshots &&
    snapshotUpdates !== undefined &&
    result?.status === 'passed' &&
    exit.reason === 'exit' &&
    exit.code === 0 &&
    !signal.aborted
  ) {
    try {
      if (deferSnapshotUpdates) {
        await deferSnapshotUpdates(options.entry.file, snapshotUpdates)
      } else {
        await commitSnapshotUpdates(options.entry.file, snapshotUpdates, {
          signal,
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
  if (options.coverage && exit.reason !== 'cancelled' && !signal.aborted) {
    try {
      if (exit.reason !== 'exit' || exit.code !== 0 || signal.aborted) {
        throw new Error('Test coverage is incomplete after worker interruption')
      }
      assertCoverageCompletion(coverage, artifact, options.runId)
      if (!attempts.complete)
        throw new Error('Test coverage has incomplete attempts or cleanup')
      if (!coverage.complete) throw new Error(coverage.error.message)
      await onCoverage!(coverage)
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
  return finalResult
}
