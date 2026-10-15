import '../../../server/require-hook'
import '../../../server/node-environment'
import { isAbsolute } from 'node:path'
import { lstat } from 'node:fs/promises'
import type { ResultEvent, ResultStatus } from '../reporting/events'
import type { RunnerFailure } from '../runner/lifecycle'
import type {
  WorkerInput,
  WorkerLeaseInput,
  WorkerLeaseMessage,
  WorkerLeaseRequest,
} from './protocol'
import type { TestFileCollection } from '../contracts'
import {
  mapSnapshotLocation,
  mapTestAnnotationLocation,
  serializeSourceMappedDiagnostic as serializeDiagnostic,
} from '../reporting/source-mapped-diagnostics'
import { getFinalCaseResults } from '../reporting/final-cases'
import { setBundlerFindSourceMapImplementation } from '../../../server/patch-error-inspect'
import { createArtifactSourceMapLookup } from './source-maps'
import {
  assertCohortArtifact,
  cohortArtifactPath,
  cohortClosureIdentity,
  validateCohortFiles,
  validateCohortSource,
} from './cohort'

/** This host is used only with one native compiler-owned shared module graph. */
type Entry = {
  testRunner: typeof import('../runner')
  loadTestModule(index: number): Promise<unknown>
  initializeModuleImportTracking?(): ReturnType<
    typeof import('../runner/imports').createModuleImportTracker
  >
}
type File = ReturnType<typeof import('../runner').initializeTestFile>
type OwnedFile = {
  requestId: number
  input: WorkerInput
  file?: File
  status: ResultStatus
}
type EventPayload<T = ResultEvent> = T extends ResultEvent
  ? Omit<T, 'version' | 'runId' | 'timestamp'>
  : never
const realDateNow = Date.now.bind(Date)
const controller = new AbortController()
const files = new Map<number, OwnedFile>()
const byFile = new Map<string, OwnedFile>()
const pendingMessages: Promise<void>[] = []
let lease: WorkerLeaseInput | undefined
let entry: Entry | undefined
let worker:
  | ReturnType<typeof import('../runner').initializeTestWorker>
  | undefined
let imports:
  | ReturnType<typeof import('../runner/imports').createModuleImportTracker>
  | undefined
let closure: string | undefined
let expectedIndex = 0
let busy = false
let closing = false
let failed = false
let queue = Promise.resolve()

function send(message: WorkerLeaseMessage): Promise<void> {
  const result = new Promise<void>((resolveSend, reject) => {
    if (!process.send)
      return reject(new Error('Shared test worker requires IPC.'))
    process.send(message, (error: Error | null) =>
      error ? reject(error) : resolveSend()
    )
  })
  pendingMessages.push(result)
  void result.catch(() => {
    failed = true
  })
  return result
}
async function flush() {
  for (const message of pendingMessages) await message
}
function event(owner: OwnedFile, payload: EventPayload) {
  return send({
    type: 'file-message',
    leaseId: lease!.leaseId,
    requestId: owner.requestId,
    message: {
      type: 'event',
      event: {
        ...payload,
        version: 1,
        runId: lease!.runId,
        timestamp: realDateNow(),
      } as ResultEvent,
    },
  })
}
function diagnostic(
  owner: OwnedFile,
  error: unknown,
  phase: 'collection' | 'runtime' | 'cleanup',
  unhandled = false
) {
  return event(owner, {
    type: 'diagnostic',
    entryId: owner.input.artifact.entryId,
    revision: lease!.revision,
    diagnostic: {
      ...serializeDiagnostic(error, { phase }),
      ...(unhandled ? { unhandled: 'rejection' as const } : {}),
    },
  })
}
const reported = new Map<unknown, Set<number>>()
function report(
  owner: OwnedFile,
  error: unknown,
  phase: 'collection' | 'runtime' | 'cleanup',
  unhandled = false
) {
  let origins = reported.get(error)
  if (!origins) reported.set(error, (origins = new Set()))
  if (origins.has(owner.requestId)) return Promise.resolve()
  origins.add(owner.requestId)
  return diagnostic(owner, error, phase, unhandled)
}
function runtimeFailure(failure: import('../runner').WorkerRuntimeFailure) {
  failed = true
  // Unknown worker-origin work poisons the cohort without borrowing the active file.
  const owner = failure.fileId ? byFile.get(failure.fileId) : undefined
  if (owner) void report(owner, failure.error, 'runtime').catch(fatal)
}
function fatal(error: unknown) {
  failed = true
  controller.abort(error)
  console.error(error)
  process.exit(1)
}
const turn = () => new Promise<void>((resolveTurn) => setImmediate(resolveTurn))

async function runFile(requestId: number, input: WorkerInput) {
  if (
    !lease ||
    closing ||
    failed ||
    requestId !== expectedIndex ||
    files.has(requestId)
  )
    throw new Error('Invalid shared worker file protocol phase.')
  const { artifact, options, cacheScope } = input
  assertCohortArtifact(artifact, options.entry, options.projectDir, lease)
  const environmentEntry = options.entry as typeof options.entry & {
    executionEnvironment?: unknown
    environmentSourceHash?: string
    inSource?: true
  }
  if (
    options.runId !== lease.runId ||
    options.setupFiles.length ||
    options.snapshotSerializers?.length ||
    options.coverage ||
    options.browser ||
    options.inspect ||
    environmentEntry.executionEnvironment ||
    environmentEntry.inSource ||
    (environmentEntry.environmentSourceHash !== undefined &&
      environmentEntry.environmentSourceHash !== artifact.sourceHash) ||
    (options.collectOnly &&
      (options.updateSnapshots ||
        (options.snapshotUpdateMode &&
          options.snapshotUpdateMode !== 'none'))) ||
    cacheScope?.type !== 'file' ||
    !isAbsolute(cacheScope.directory) ||
    !(await lstat(cacheScope.directory)).isDirectory()
  )
    throw new Error(
      'Unsupported shared Node worker execution options or retained file cache.'
    )
  if (artifact.cohort.index !== expectedIndex)
    throw new Error(
      'Shared worker requests must follow compiler-owned cohort order.'
    )
  const identity = cohortClosureIdentity(artifact)
  if (closure !== undefined && closure !== identity)
    throw new Error('Shared worker cannot mix immutable compiler closures.')
  await validateCohortSource(artifact, options.entry, options.projectDir)
  const owner: OwnedFile = { requestId, input, status: 'failed' }
  files.set(requestId, owner)
  byFile.set(artifact.entryId, owner)
  const started = performance.now()
  let phase: 'collection' | 'runtime' = 'collection'
  let collection: TestFileCollection | undefined
  const runnerFailure = (failure: RunnerFailure) =>
    serializeDiagnostic(failure.error, {
      phase: failure.phase === 'cleanup' ? 'cleanup' : 'runtime',
    })
  try {
    if (!entry) {
      await validateCohortFiles(artifact)
      closure = identity
      setBundlerFindSourceMapImplementation(
        createArtifactSourceMapLookup(artifact)
      )
      // The template defers every actual spec import until its collector is active.
      entry = require(
        cohortArtifactPath(artifact.rootDir, artifact.entryPath)
      ) as Entry
      if (
        typeof entry.testRunner?.initializeTestWorker !== 'function' ||
        typeof entry.testRunner.routeUnhandledRejection !== 'function' ||
        typeof entry.loadTestModule !== 'function'
      )
        throw new Error(
          'Compiled shared entry lacks the worker runtime dispatch contract.'
        )
      imports = entry.initializeModuleImportTracking?.()
      worker = entry.testRunner.initializeTestWorker({
        workerId: lease.leaseId,
        onFailure: runtimeFailure,
      })
    }
    const file = (owner.file = worker!.createFile({
      fileId: artifact.entryId,
      filePath: options.entry.file,
      collectOnly: options.collectOnly,
      updateSnapshots: options.updateSnapshots,
      snapshotUpdateMode: options.snapshotUpdateMode,
      mapSnapshotLocation,
      tags: options.tags,
      strictTags: options.strictTags,
      globals: options.globals,
      fakeTimers: options.fakeTimers,
      waitForImports: imports?.waitForImports,
      clearMocks: options.clearMocks,
      mockReset: options.mockReset,
      restoreMocks: options.restoreMocks,
      unstubGlobals: options.unstubGlobals,
      unstubEnvs: options.unstubEnvs,
      retry: options.retry,
      testTimeout: options.testTimeout,
      hookTimeout: options.hookTimeout,
      sequence: options.sequence,
      provide: options.provide,
      onUnhandledRejection(reason) {
        failed = true
        void report(owner, reason, 'runtime', true).catch(fatal)
      },
    }))
    await file.collect(() => entry!.loadTestModule(artifact.cohort.index))
    controller.signal.throwIfAborted()
    if (options.collectOnly) {
      collection = {
        version: 1,
        entryId: artifact.entryId,
        revision: artifact.revision,
        cases: file.getCollectedCases({
          testNamePattern: options.testNamePattern,
          allowOnly: options.allowOnly,
        }),
      }
      owner.status = 'passed'
    } else {
      phase = 'runtime'
      const result = await file.run({
        runId: options.runId,
        signal: controller.signal,
        projectName: options.entry.profile.id,
        projectDir: options.projectDir,
        attachmentsDir: options.attachmentsDir,
        getAnnotationLocation: (error) =>
          mapTestAnnotationLocation(error, options.entry.file),
        onAnnotation(context, annotation) {
          return event(owner, {
            type: 'test-annotation',
            entryId: artifact.entryId,
            caseId: context.testId,
            attempt: {
              id: context.id,
              retry: context.retry,
              repeat: context.repeat,
            },
            revision: artifact.revision,
            annotation,
          })
        },
        testTimeout: options.testTimeout,
        hookTimeout: options.hookTimeout,
        sequence: options.sequence,
        maxConcurrency: options.maxConcurrency,
        retry: options.retry,
        bail: options.bail,
        allowOnly: options.allowOnly,
        passWithNoTests: options.passWithNoTests,
        testNamePattern: options.testNamePattern,
        onLateFailure(error) {
          failed = true
          void report(owner, error, 'runtime').catch(fatal)
        },
        onSuiteEnd(suiteResult) {
          return event(owner, {
            type: 'suite-end',
            ...suiteResult,
            revision: artifact.revision,
            errors: suiteResult.errors.map(runnerFailure),
          })
        },
        onCaseStart(context) {
          return event(owner, {
            type: 'case-start',
            entryId: artifact.entryId,
            caseId: context.testId,
            attempt: {
              id: context.id,
              retry: context.retry,
              repeat: context.repeat,
            },
            name: context.name,
            testName: context.testName,
            ancestors: context.ancestors,
            mode: context.mode,
            revision: artifact.revision,
          })
        },
        onCaseEnd(caseResult) {
          return event(owner, {
            type: 'case-end',
            ...caseResult,
            revision: artifact.revision,
            errors: caseResult.errors.map(runnerFailure),
          })
        },
      })
      for (const failure of result.errors)
        await report(
          owner,
          failure.error,
          failure.phase === 'cleanup' ? 'cleanup' : 'runtime'
        )
      const cases = getFinalCaseResults(result.cases)
      owner.status =
        result.errors.length ||
        [...cases.values()].some((item) => item.status === 'failed')
          ? 'failed'
          : result.interrupted ||
              [...cases.values()].some((item) => item.status === 'cancelled')
            ? 'cancelled'
            : 'passed'
      if (controller.signal.aborted) owner.status = 'cancelled'
    }
  } catch (error) {
    failed = true
    owner.status = controller.signal.aborted ? 'cancelled' : 'failed'
    await report(owner, error, phase)
  } finally {
    try {
      await owner.file?.dispose()
    } catch (error) {
      failed = true
      owner.status = 'failed'
      await report(owner, error, 'cleanup')
    }
    try {
      const snapshot = owner.file?.getSnapshotSummary()
      if (snapshot)
        await event(owner, {
          type: 'snapshot-summary',
          entryId: artifact.entryId,
          revision: artifact.revision,
          snapshot,
        })
    } catch (error) {
      failed = true
      owner.status = 'failed'
      await report(owner, error, 'cleanup')
    }
  }
  await turn()
  await flush()
  if (failed || worker?.getFailures().length) owner.status = 'failed'
  expectedIndex++
  // This acknowledgement allows only scheduling. Snapshots await shared disposal.
  await send({
    type: 'file-message',
    leaseId: lease.leaseId,
    requestId,
    reusable:
      !failed && !controller.signal.aborted && !worker?.getFailures().length,
    message: {
      type: 'complete',
      result: {
        entryId: artifact.entryId,
        status: owner.status,
        durationMs: performance.now() - started,
      },
      ...(collection && owner.status === 'passed' ? { collection } : {}),
    },
  })
  await flush()
}

async function finish(finishToken: string) {
  if (!lease || !finishToken || closing || busy)
    throw new Error('Invalid shared worker finish phase.')
  closing = true
  try {
    await worker?.dispose()
  } finally {
    imports?.dispose()
  }
  await turn()
  await flush()
  if (failed || controller.signal.aborted || worker?.getFailures().length)
    throw new Error('Shared worker cleanup or originating async work failed.')
  const snapshotUpdates: NonNullable<
    Extract<WorkerLeaseMessage, { type: 'worker-complete' }>['snapshotUpdates']
  > = []
  for (const owner of files.values()) {
    if (owner.input.options.updateSnapshots && owner.status === 'passed') {
      snapshotUpdates.push({
        requestId: owner.requestId,
        updates: owner.file!.takeSnapshotUpdates(),
      })
    }
  }
  await send({
    type: 'worker-complete',
    leaseId: lease.leaseId,
    finishToken,
    snapshotUpdates,
  })
  await flush()
  process.exit(process.exitCode ?? 0)
}

process.on(
  'message',
  (
    message:
      | WorkerLeaseRequest
      | { type: 'run'; input: WorkerLeaseInput }
      | { type: 'cancel' }
  ) => {
    if (message.type === 'cancel') {
      closing = true
      failed = true
      controller.abort(new Error('Shared test worker cancelled.'))
      void queue
        .finally(async () => {
          try {
            await worker?.dispose()
          } finally {
            imports?.dispose()
            process.exit(1)
          }
        })
        .catch(fatal)
      return
    }
    if (message.type === 'run') {
      if (
        lease ||
        message.input.version !== 1 ||
        !message.input.leaseId ||
        !isAbsolute(message.input.rootDir)
      )
        return fatal(new Error('Invalid shared worker startup identity.'))
      lease = message.input
      void send({ type: 'worker-ready', leaseId: lease.leaseId }).catch(fatal)
      return
    }
    if (!lease || message.leaseId !== lease.leaseId || closing || busy)
      return fatal(
        new Error('Mismatched or overlapping shared worker request.')
      )
    if (message.type === 'file') {
      busy = true
      queue = queue
        .then(() => runFile(message.requestId, message.input))
        .finally(() => {
          busy = false
        })
      void queue.catch(fatal)
    } else if (message.type === 'finish-worker') {
      queue = queue.then(() => finish(message.finishToken))
      void queue.catch(fatal)
    }
  }
)
process.once('disconnect', () => process.exit(1))
process.on('unhandledRejection', (reason) => {
  // Use the emitted runtime's actual ALS origin; never an active-file callback.
  if (!entry?.testRunner.routeUnhandledRejection(reason)) fatal(reason)
})
