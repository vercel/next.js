import { randomUUID } from 'crypto'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  CompiledTestCohort,
  ExecuteTestCohort,
  ExecuteTestOptions,
  TestExecutionResult,
} from '../contracts'
import type { ResultEvent } from '../reporting/events'
import { serializeDiagnostic } from '../reporting/diagnostics'
import { validateCompiledTestCohort } from './cohort'
import { createTestWorkerLease, isWorkerLeaseClosedError } from './worker-lease'
import type { WorkerInput, WorkerFileCompletion } from './protocol'
import {
  commitSnapshotUpdates,
  resolveSnapshotUpdateMode,
  type SnapshotUpdate,
} from '../assertions/snapshots'

const certifiedFailures = new WeakSet<object>()

/** Created only in an owning parent, or reconstructed from its private response.
 * A child-supplied error name/property never certifies the parent's resources. */
export class CohortExecutionClosedError extends Error {
  readonly cancelled: boolean
  constructor(cause: unknown, cancelled = false) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = 'CohortExecutionClosedError'
    this.cancelled = cancelled
    certifiedFailures.add(this)
  }
}

export function isCohortExecutionClosedError(
  error: unknown
): error is CohortExecutionClosedError {
  return !!error && typeof error === 'object' && certifiedFailures.has(error)
}

export const executeCohort: ExecuteTestCohort = (cohort, options) =>
  executeCohortWithEnvironment(cohort, options, process.env)

/** The broker parent owns this process, independently of the compiler child. */
export async function executeCohortWithEnvironment(
  cohort: CompiledTestCohort,
  options: readonly ExecuteTestOptions[],
  environment: NodeJS.ProcessEnv,
  deferSnapshotUpdates?: (
    entryId: string,
    file: string,
    updates: SnapshotUpdate[],
    sourceHash?: string
  ) => Promise<void>
): Promise<readonly TestExecutionResult[]> {
  const ownership: {
    starting: boolean
    lease?: Awaited<ReturnType<typeof createTestWorkerLease>>
  } = { starting: false }
  try {
    return await runCohort(
      ownership,
      cohort,
      options,
      environment,
      deferSnapshotUpdates
    )
  } catch (error) {
    if (
      !ownership.starting ||
      ownership.lease?.ownershipClosed ||
      isWorkerLeaseClosedError(error)
    ) {
      const signal = options[0]?.signal
      const cancelled =
        !!signal?.aborted &&
        (error === signal.reason ||
          (isWorkerLeaseClosedError(error) && error.cause === signal.reason))
      throw new CohortExecutionClosedError(error, cancelled)
    }
    throw error
  }
}

async function runCohort(
  ownership: {
    starting: boolean
    lease?: Awaited<ReturnType<typeof createTestWorkerLease>>
  },
  cohort: CompiledTestCohort,
  options: readonly ExecuteTestOptions[],
  environment: NodeJS.ProcessEnv,
  deferSnapshotUpdates?: (
    entryId: string,
    file: string,
    updates: SnapshotUpdate[],
    sourceHash?: string
  ) => Promise<void>
): Promise<readonly TestExecutionResult[]> {
  const first = options[0]
  if (!first || options.length !== cohort.artifacts.length)
    throw new Error(
      'Shared worker options must match every compiler cohort entry.'
    )
  const entries = options.map((value) => value.entry)
  await validateCompiledTestCohort(cohort, entries, first.projectDir)
  const snapshotUpdateMode = resolveSnapshotUpdateMode(first)
  for (const value of options) {
    if (
      value.signal !== first.signal ||
      value.runId !== first.runId ||
      value.projectDir !== first.projectDir ||
      value.collectOnly ||
      value.inspect ||
      value.browser ||
      value.coverage ||
      value.onCoverage ||
      value.bail ||
      value.entry.inSource ||
      value.entry.executionEnvironment ||
      value.setupFiles.length ||
      value.snapshotSerializers?.length ||
      resolveSnapshotUpdateMode(value) !== snapshotUpdateMode
    )
      throw new Error(
        'Shared workers require one serial development Node execution without collection, debugging, coverage, bail, setup or serializers.'
      )
    if (value.testNamePattern !== undefined) new RegExp(value.testNamePattern)
  }
  first.signal.throwIfAborted()
  const envelope = () => ({
    version: 1 as const,
    runId: first.runId,
    timestamp: Date.now(),
  })
  const byEntry = new Map(options.map((value) => [value.entry.id, value]))
  const event = (value: ResultEvent) => {
    const entryId =
      value.type === 'file-start'
        ? value.entry.id
        : 'entryId' in value
          ? value.entryId
          : undefined
    const owner = entryId ? byEntry.get(entryId) : first
    if (!owner) throw new Error('Unrequested shared worker event owner.')
    owner.onEvent(value)
  }
  ownership.starting = true
  const lease = await createTestWorkerLease(
    require.resolve('./cohort-worker'),
    {
      cwd: first.projectDir,
      env: {
        ...environment,
        NODE_ENV: 'development',
        __NEXT_DEV_SERVER: 'true',
      },
      input: {
        version: 1,
        leaseId: randomUUID(),
        runId: first.runId,
        rootDir: cohort.artifacts[0].rootDir,
        revision: cohort.artifacts[0].revision,
        profile: cohort.artifacts[0].profile,
      },
      signal: first.signal,
      startupTimeoutMs: first.fileTimeout,
      finishTimeoutMs: Math.max(...options.map((value) => value.fileTimeout)),
      onEvent: event,
      onOutput(stream, chunk) {
        event({
          ...envelope(),
          type: 'output',
          stream,
          text: chunk.toString('utf8'),
        })
      },
      // The compiler owner retains its immutable emission separately. File cache
      // releases transfer to enqueue and stay owned until the real process closes.
      release: async () => {},
    }
  )
  ownership.lease = lease
  let completions: readonly WorkerFileCompletion[]
  try {
    for (const [index, artifact] of cohort.artifacts.entries()) {
      first.signal.throwIfAborted()
      const value = options[index]
      const {
        signal,
        onEvent: _onEvent,
        onCoverage: _onCoverage,
        onSnapshotUpdates: _onSnapshotUpdates,
        ...serializable
      } = value
      event({
        ...envelope(),
        type: 'file-start',
        entry: value.entry,
        revision: artifact.revision,
      })
      const directory = await mkdtemp(join(tmpdir(), 'next-test-cache-'))
      const input: WorkerInput = {
        artifact,
        options: {
          ...serializable,
          snapshotUpdateMode,
          updateSnapshots: snapshotUpdateMode !== 'none',
        },
        cacheScope: { type: 'file', directory },
      }
      // enqueue takes cache ownership even when a poisoned/closing lease refuses
      // this request. Do not release any submitted cache before the process exits.
      await lease.enqueue(
        input,
        () => rm(directory, { recursive: true, force: true }),
        signal
      )
    }
    completions = await lease.finish()
    first.signal.throwIfAborted()
    await validateCompiledTestCohort(cohort, entries, first.projectDir)
    if (
      completions.length !== options.length ||
      completions.some(
        (value, index) => value.result.entryId !== options[index].entry.id
      )
    )
      throw new Error(
        'Shared worker omitted or reordered an authoritative file result.'
      )
  } catch (error) {
    let failure = error
    try {
      await lease.abort(error)
    } catch (cleanupError) {
      if (cleanupError !== error)
        failure = new AggregateError(
          [error, cleanupError],
          'Shared execution and cleanup failed.'
        )
    }
    throw failure
  }
  const results: TestExecutionResult[] = []
  for (const [index, completion] of completions.entries()) {
    const value = options[index]
    let result: TestExecutionResult = completion.result
    if (
      result.status === 'passed' &&
      completion.snapshotUpdates !== undefined
    ) {
      try {
        first.signal.throwIfAborted()
        const artifact = cohort.artifacts[index]
        if (deferSnapshotUpdates)
          await deferSnapshotUpdates(
            value.entry.id,
            value.entry.file,
            completion.snapshotUpdates,
            artifact.sourceHash
          )
        else if (value.onSnapshotUpdates)
          await value.onSnapshotUpdates(
            value.entry.file,
            completion.snapshotUpdates
          )
        else
          await commitSnapshotUpdates(
            value.entry.file,
            completion.snapshotUpdates,
            {
              projectDir: first.projectDir,
              signal: first.signal,
              sourceHash: artifact.sourceHash,
            }
          )
      } catch (error) {
        result = {
          ...result,
          status: first.signal.aborted ? 'cancelled' : 'failed',
        }
        event({
          ...envelope(),
          type: 'diagnostic',
          entryId: value.entry.id,
          revision: cohort.artifacts[index].revision,
          diagnostic: serializeDiagnostic(error, { phase: 'cleanup' }),
        })
      }
    }
    const final = { ...result }
    event({ ...envelope(), type: 'file-end', ...final })
    results.push(final)
  }
  return results
}
