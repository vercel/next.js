import { restoreNodeStackTrace } from './node-stack-trace'
import { findSourceMap } from 'node:module'
import type { ModernSourceMapPayload } from '../../../server/lib/source-maps'
import {
  captureJUnitSuiteTask,
  assertJUnitSuiteRole,
} from '../reporting/junit-suites'
import {
  assertPublicSnapshotPreparationRole,
  captureSnapshotPreparationFailure,
  type SnapshotPreparationFailure,
} from './snapshot-preparation'
import { assertUnexecutedCaseResult } from '../reporting/unexecuted-cases'
import { createReporterTaskUpdates } from '../reporting/task-updates'
import { captureReporterTaskTree } from '../reporting/live-tasks'
import { captureProductionStaticMockClosure } from '../mocking/production-artifact'
import type { CustomCoverageCompletion } from '../coverage/custom-types'
import '../../../server/require-hook'
import '../../../server/node-environment'
import {
  createCapturedStackMapper,
  createSuiteErrorResultProjection,
} from './suite-error-projection'

import {
  prepareCompiledRscEntry,
  validateRscEntryArtifact,
  type CompiledRscEntry,
} from './rsc-entry'
import { isAbsolute, relative, resolve, sep } from 'path'
import {
  mapSnapshotLocation,
  mapTestAnnotationLocation,
  serializeSourceMappedDiagnostic as serializeDiagnostic,
} from '../reporting/source-mapped-diagnostics'
import { mapTestArtifactLocation } from '../reporting/artifact-location'
import { mapTestDeclarationLocation } from '../reporting/declaration-location'
import type { CaseResult, ResultEvent, ResultStatus } from '../reporting/events'
import { getFinalCaseResults } from '../reporting/final-cases'
import type { RunnerFailure } from '../runner/lifecycle'
import type { RuntimeModuleCompletion } from './completed-module'
import type { WorkerInput, WorkerMessage } from './protocol'
import type {
  AnyTestCoverageCompletion,
  TestFileCollection,
} from '../contracts'
import { setBundlerFindSourceMapImplementation } from '../../../server/patch-error-inspect'
import { createArtifactSourceMapLookup } from './source-maps'
import { createArtifactRegistrationOriginMapper } from './registration-origin'
import { createLateFailureSink } from './late-failures'
import { browserOutputDirectory } from './browser-output'
import { assertArtifactProfile } from './artifact-profile'
import { assertCompiledSetup } from './setup'
import {
  captureNodeV8CollectionCoverage,
  captureNodeV8CollectionRestorationCoverage,
  captureNodeV8ReadOnlySnapshotCoverage,
} from './coverage'
import { openTestEnvironment } from '../environments/runtime'
import { installTestConsole } from './console'
import {
  assertNodeProjectEnvironment,
  applyNodeProjectEnvironment,
} from './project-env'

type EventPayload<T = ResultEvent> = T extends ResultEvent
  ? Omit<T, 'version' | 'runId' | 'timestamp'>
  : never

const realDateNow = Date.now.bind(Date)
const controller = new AbortController()
const userCancellation = new AbortController()
let running = false
let releaseNativeAssertionRecords: (() => void) | undefined
let reportUnhandledRejection:
  | ((reason: unknown, promise: Promise<unknown>) => void)
  | undefined
let pendingConsoleDrain:
  | {
      runId: string
      entryId: string
      revision: string
      resolve(): void
      reject(error: unknown): void
    }
  | undefined
let pendingTaskUpdatesDrain: typeof pendingConsoleDrain
let pendingCustomSuite:
  | {
      completion: CustomCoverageCompletion
      resolve(): void
      reject(error: unknown): void
    }
  | undefined

function send(message: WorkerMessage): Promise<void> {
  return new Promise((resolveSend, reject) => {
    if (!process.send) return reject(new Error('Test worker requires IPC'))
    process.send(message, (error: Error | null) =>
      error ? reject(error) : resolveSend()
    )
  })
}

async function drainParentConsole(identity: {
  runId: string
  entryId: string
  revision: string
}) {
  controller.signal.throwIfAborted()
  if (pendingConsoleDrain) throw new Error('Duplicate console drain.')
  let cancel!: () => void
  const received = new Promise<void>((resolveReceived, reject) => {
    pendingConsoleDrain = { ...identity, resolve: resolveReceived, reject }
    cancel = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', cancel, { once: true })
  })
  try {
    await send({ type: 'console-drain', ...identity })
    await received
  } finally {
    void received.catch(() => {})
    controller.signal.removeEventListener('abort', cancel)
    pendingConsoleDrain = undefined
  }
}

async function drainParentTaskUpdates(identity: {
  runId: string
  entryId: string
  revision: string
}) {
  controller.signal.throwIfAborted()
  if (pendingTaskUpdatesDrain) throw new Error('Duplicate task update drain.')
  let cancel!: () => void
  const received = new Promise<void>((resolveReceived, reject) => {
    pendingTaskUpdatesDrain = { ...identity, resolve: resolveReceived, reject }
    cancel = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', cancel, { once: true })
  })
  void received.catch(() => {})
  try {
    await send({ type: 'task-updates-drain', ...identity })
    await received
  } finally {
    void received.catch(() => {})
    controller.signal.removeEventListener('abort', cancel)
    pendingTaskUpdatesDrain = undefined
  }
}

async function handOffCustomSuite(completion: CustomCoverageCompletion) {
  controller.signal.throwIfAborted()
  if (pendingCustomSuite) throw new Error('Duplicate custom coverage handoff.')
  let cancel!: () => void
  const received = new Promise<void>((resolveReceived, reject) => {
    pendingCustomSuite = { completion, resolve: resolveReceived, reject }
    cancel = () => reject(controller.signal.reason)
    controller.signal.addEventListener('abort', cancel, { once: true })
  })
  try {
    await send({ type: 'custom-coverage-suite', completion })
    await received
  } finally {
    // A failed send may precede a cancellation rejection.
    void received.catch(() => {})
    controller.signal.removeEventListener('abort', cancel)
    pendingCustomSuite = undefined
  }
}

function artifactPath(root: string, file: string): string {
  const resolved = resolve(root, file)
  const path = relative(root, resolved)
  if (
    !isAbsolute(root) ||
    isAbsolute(file) ||
    path === '..' ||
    path.startsWith(`..${sep}`)
  ) {
    throw new Error(
      'Compiled test artifact paths must stay within their revision root.'
    )
  }
  return resolved
}

async function run({
  artifact,
  options,
  cacheScope,
  customCoverageSuite,
  userCancellation: allowUserCancellation,
}: WorkerInput) {
  const started = performance.now()
  const v8CollectionCoverage = captureNodeV8CollectionCoverage(
    artifact,
    options
  )
  const v8CollectionRestoration = captureNodeV8CollectionRestorationCoverage(
    artifact,
    options
  )
  const v8ReadOnlySnapshots = captureNodeV8ReadOnlySnapshotCoverage(
    artifact,
    options
  )
  const prepareReadOnlyEmptyPublicFile =
    v8ReadOnlySnapshots ||
    (options.coverage?.kind === 'node-istanbul' &&
      options.snapshotUpdateMode === 'none' &&
      artifact.kind === 'node' &&
      artifact.profile.mode === 'development' &&
      artifact.profile.environment === 'node' &&
      artifact.profile.route === undefined &&
      artifact.profile.browserClient === undefined &&
      !artifact.cohort &&
      !artifact.moduleMocking &&
      !artifact.moduleCache &&
      !artifact.dynamicModuleMocking &&
      !artifact.sourceDependencies &&
      !artifact.nativeTsConfigInputs &&
      !options.customCoverage &&
      !options.collectOnly &&
      /\.(?:mjs|js)$/.test(options.entry.file) &&
      (!options.entry.executionEnvironment ||
        options.entry.executionEnvironment.name === 'node'))
  // The actual finalized task tree decides whether the SDK prepares this file.
  const prepareReadOnlySelectedPublicFile = prepareReadOnlyEmptyPublicFile
  type CollectionRestoration = Readonly<{
    collectionError: unknown
    disposalError: unknown
  }>
  const restorationDescriptor = Object.getOwnPropertyDescriptor
  const restorationKeys = Reflect.ownKeys
  const restorationFrozen = Object.isFrozen
  const restorationApply = Reflect.apply
  let observedCollectionRestoration: CollectionRestoration | undefined
  let provisionalRestorationFailure:
    | {
        error: unknown
        index: number
        diagnostic: ReturnType<typeof serializeDiagnostic>
      }
    | undefined
  const readCollectionRestoration = (): CollectionRestoration | undefined => {
    if (!v8CollectionRestoration || !file) return undefined
    try {
      const method = restorationDescriptor(
        file,
        'getCompletedCollectionRestorationFailure'
      )
      const value =
        method && 'value' in method && typeof method.value === 'function'
          ? restorationApply(method.value, file, [])
          : undefined
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !restorationFrozen(value) ||
        restorationKeys(value).length !== 2
      )
        return undefined
      const collection = restorationDescriptor(value, 'collectionError')
      const disposal = restorationDescriptor(value, 'disposalError')
      if (
        !collection ||
        !('value' in collection) ||
        !disposal ||
        !('value' in disposal)
      )
        return undefined
      return value as CollectionRestoration
    } catch {
      return undefined
    }
  }
  const moduleFailures = options.captureCompletedModuleResult
    ? new Map<unknown, ReturnType<typeof serializeDiagnostic>>()
    : undefined
  let provisionalCollectionFailure:
    | {
        error: unknown
        index: number
        diagnostic: ReturnType<typeof serializeDiagnostic>
      }
    | undefined
  const event = (payload: EventPayload, timestamp = realDateNow()) =>
    send({
      type: 'event',
      event: {
        ...payload,
        ...((options.captureModuleCollected === true ||
          options.preparePublicSnapshots === true) &&
        (payload.type === 'file-collected' ||
          (payload.type === 'task-update' &&
            payload.kind !== 'task-packs-after-collection-failure'))
          ? {
              taskTree: {
                ...payload.taskTree,
                projectName: options.entry.projectName ?? '',
              },
            }
          : {}),
        version: 1,
        runId: options.runId,
        timestamp,
      } as ResultEvent,
    })
  const diagnostic = (
    error: unknown,
    phase: 'collection' | 'runtime' | 'cleanup',
    unhandled?: 'rejection',
    fileErrorIndex?: number
  ) => {
    const failure = {
      ...serializeDiagnostic(error, { phase }),
      ...(unhandled ? { unhandled } : {}),
    }
    moduleFailures?.set(error, failure)
    if (fileErrorIndex !== undefined) {
      const observed = { error, index: fileErrorIndex, diagnostic: failure }
      if (phase === 'collection') provisionalCollectionFailure = observed
      else if (phase === 'cleanup') provisionalRestorationFailure = observed
    }
    return event({
      type: 'diagnostic',
      entryId: artifact.entryId,
      revision: artifact.revision,
      ...(fileErrorIndex !== undefined
        ? { coverageFileError: { index: fileErrorIndex } }
        : {}),
      diagnostic: failure,
    })
  }
  let registrationOrigin:
    | ReturnType<typeof createArtifactRegistrationOriginMapper>
    | undefined
  const runnerFailure = (failure: RunnerFailure) =>
    serializeDiagnostic(failure.error, {
      phase: failure.phase === 'cleanup' ? 'cleanup' : 'runtime',
      registrationOrigin: failure.registrationError
        ? registrationOrigin?.(failure.registrationError, 'registration')
        : undefined,
    })
  const reportedSuiteErrors: {
    failure: RunnerFailure
    suiteId: string
    index: number
  }[] = []
  assertPublicSnapshotPreparationRole(artifact, options)
  assertJUnitSuiteRole(artifact, options)
  const carriedRetryOptions =
    options.captureTaskResults === true &&
    artifact.kind === 'node' &&
    artifact.profile.environment === 'node' &&
    artifact.profile.route === undefined &&
    artifact.profile.browserClient === undefined &&
    !artifact.cohort &&
    (!options.entry.executionEnvironment ||
      options.entry.executionEnvironment.name === 'node')
  const taskUpdates =
    options.captureTaskResults || options.preparePublicSnapshots === true
      ? createReporterTaskUpdates<CaseResult>({
          ...(carriedRetryOptions
            ? { carriedRetryOptions: true as const }
            : {}),
          ...(options.captureModuleStart === true
            ? { captureModuleStart: true as const }
            : {}),
          getTaskLocation: (task) => file?.getPublishedTaskLocation(task),
          onUpdate: (update) =>
            event({
              type: 'task-update',
              entryId: artifact.entryId,
              revision: artifact.revision,
              ...update,
              caseResults: update.caseResults,
            }),
        })
      : undefined
  let collectedPublicationStage: 'capture' | 'send' | 'complete' | undefined
  const unhandledRejections = new Set<unknown>()
  const lateFailures = createLateFailureSink<unknown>((error) =>
    diagnostic(
      error,
      'runtime',
      unhandledRejections.has(error) ? 'rejection' : undefined
    )
  )
  let snapshotUnhandledClean = true
  let coverageUnhandledClean = true
  const nativeCoverageOccurrences: {
    reason: unknown
    promise: Promise<unknown>
    afterAll: boolean
  }[] = []
  const reportLateFailure = (reason: unknown) => {
    snapshotUnhandledClean = false
    if (
      !(
        options.coverage?.kind === 'node-istanbul' &&
        activeNativeRejection?.recordedCoverageAfterAll &&
        activeNativeRejection.reason === reason
      )
    )
      coverageUnhandledClean = false
    lateFailures.report(reason)
  }
  let routeRuntimeUnhandled:
    | ((reason: unknown, promise: Promise<unknown>) => boolean)
    | undefined
  let activeNativeRejection:
    | {
        reason: unknown
        promise: Promise<unknown>
        recordedBody: boolean
        recordedCoverageAfterAll: boolean
      }
    | undefined
  let collection: TestFileCollection | undefined
  let publishingResult = false
  // Keep the process handler installed through cleanup and terminal IPC. A
  // rejection fails the file without discarding already completed case facts.
  reportUnhandledRejection = (reason, promise) => {
    unhandledRejections.add(reason)
    activeNativeRejection = {
      reason,
      promise,
      recordedBody: false,
      recordedCoverageAfterAll: false,
    }
    try {
      routeRuntimeUnhandled?.(reason, promise)
      if (!activeNativeRejection.recordedBody || publishingResult)
        snapshotUnhandledClean = false
      nativeCoverageOccurrences.push({
        reason,
        promise,
        afterAll: activeNativeRejection.recordedCoverageAfterAll,
      })
      if (
        (!activeNativeRejection.recordedBody &&
          !activeNativeRejection.recordedCoverageAfterAll) ||
        publishingResult
      )
        coverageUnhandledClean = false
    } finally {
      activeNativeRejection = undefined
    }
    if (publishingResult) process.exitCode = 1
    lateFailures.report(reason)
  }
  let status: ResultStatus = 'failed'
  let failedCollectionObserved = false
  let failedCollectedFile: import('../runner/tasks').File | undefined
  let sentPreparationFailure = false
  const readPreparationFailure = () => {
    if (options.preparePublicSnapshots !== true || !file) return undefined
    const observed = file.getSnapshotPreparationFailure?.()
    if (!observed) return undefined
    if (
      observed.version !== 1 ||
      observed.phase !== 'snapshot-preparation' ||
      observed.invocation !== 0 ||
      (observed.source !== 'run' && observed.source !== 'failed-collection') ||
      typeof observed.propagatedThroughRun !== 'boolean' ||
      !Object.getOwnPropertyDescriptor(observed, 'error') ||
      !('value' in Object.getOwnPropertyDescriptor(observed, 'error')!)
    )
      throw new Error('Actual snapshot preparation observation is unavailable.')
    return observed
  }
  const publishPreparationFailure = async (
    observed: NonNullable<ReturnType<typeof readPreparationFailure>>
  ) => {
    if (sentPreparationFailure)
      throw new Error('Snapshot preparation was already published.')
    let failure: SnapshotPreparationFailure
    try {
      failure = captureSnapshotPreparationFailure(
        observed.error,
        {
          runId: options.runId,
          entryId: artifact.entryId,
          revision: artifact.revision,
        },
        observed.source
      )
      await send({ type: 'snapshot-preparation-failure', failure })
    } catch (error) {
      throw new AggregateError(
        [observed.error, error],
        'Snapshot preparation and its actual handoff failed.'
      )
    }
    sentPreparationFailure = true
    return failure
  }
  let coverageCollector:
    | Awaited<ReturnType<typeof import('../coverage/collector').startCoverage>>
    | Awaited<
        ReturnType<
          typeof import('../coverage/istanbul-capture').startIstanbulCoverage
        >
      >
    | undefined
  let customCollector:
    | Awaited<
        ReturnType<
          typeof import('../coverage/custom-runtime').startCustomCoverage
        >
      >
    | undefined
  let customCoverage: CustomCoverageCompletion | undefined
  let coverage: AnyTestCoverageCompletion | undefined
  let coverageComplete = true
  const provisionalCoverageFailures: RunnerFailure[] = []
  let readOnlySnapshotCompletion: (() => RunnerFailure | undefined) | undefined
  const reportedFileErrors: {
    failure: RunnerFailure
    index: number
    diagnostic: ReturnType<typeof serializeDiagnostic>
  }[] = []
  let snapshotHostComplete = true
  const unfinishedAttempts = new Set<string>()
  let file:
    | ReturnType<typeof import('../runner').initializeTestFile>
    | undefined
  let rscBinding:
    | ReturnType<typeof import('../rsc').initializeRscTesting>
    | undefined
  let browserBinding:
    | ReturnType<typeof import('../browser').initializeBrowserTesting>
    | undefined
  const canPublishNativeBodyFacts = () =>
    artifact.kind === 'node' &&
    artifact.profile.environment === 'node' &&
    snapshotUnhandledClean &&
    file?.hasCompletedBodyExecution?.() === true
  const canPublishIstanbulNativeFacts = () =>
    options.coverage?.kind === 'node-istanbul' &&
    coverageUnhandledClean &&
    file?.getCompletedCoverageFailures() !== undefined
  let environment: Awaited<ReturnType<typeof openTestEnvironment>> | undefined
  let restoreProjectEnvironment: (() => void) | undefined
  let consoleCapture: ReturnType<typeof installTestConsole> | undefined
  let readConsoleTask:
    | (() => import('./console').ConsoleTask | undefined)
    | undefined
  let phase: 'collection' | 'runtime' = 'collection'
  let moduleFailurePhase: 'load' | 'collection' | 'run' | undefined
  let moduleCompletion: RuntimeModuleCompletion | undefined
  let moduleHostCleanupComplete = true
  let importBinding:
    | ReturnType<typeof import('../runner/imports').createModuleImportTracker>
    | undefined
  let moduleCacheBinding:
    | ReturnType<typeof import('../mocking/module-cache').initializeModuleCache>
    | undefined
  let dynamicMockBinding:
    | ReturnType<
        typeof import('../mocking/dynamic').initializeDynamicModuleMocking
      >
    | undefined
  let mockBinding:
    | ReturnType<typeof import('../mocking/runtime').initializeModuleMocking>
    | undefined
  let verifyProductionStaticMock: (() => Promise<void>) | undefined
  let customTaskUpdatesFinished = false
  const finishCustomTaskUpdates = async () => {
    if (!customCollector || !taskUpdates || customTaskUpdatesFinished) return
    customTaskUpdatesFinished = true
    try {
      await taskUpdates.finish()
      await drainParentTaskUpdates({
        runId: options.runId,
        entryId: artifact.entryId,
        revision: artifact.revision,
      })
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      coverageComplete = false
      if (controller.signal.aborted && error === controller.signal.reason) {
        if (status !== 'failed') status = 'cancelled'
      } else {
        status = 'failed'
        if (!lateFailures.has(error)) await diagnostic(error, 'cleanup')
      }
    } finally {
      taskUpdates.dispose()
    }
  }
  try {
    const staticRuntimeMocks =
      artifact.kind === 'node' &&
      artifact.dynamicModuleMocking?.staticMocks === 1
    const originalInitialMocks =
      artifact.kind === 'node' &&
      artifact.dynamicModuleMocking?.nativeOriginalInitial === 1
    const nativeRuntimeMocks = staticRuntimeMocks || originalInitialMocks
    const originalCommonJsRequireReset =
      artifact.moduleMocking?.originalCommonJsRequireReset === 1
    if (
      artifact.moduleMocking?.originalCommonJsRequireReset !== undefined &&
      (!originalCommonJsRequireReset ||
        artifact.kind !== 'node' ||
        artifact.profile.environment !== 'node' ||
        !['development', 'production'].includes(artifact.profile.mode) ||
        (artifact.profile.mode === 'production' &&
          (artifact.profile.runtime !== 'nodejs' ||
            artifact.profile.bundler !== 'turbopack' ||
            options.customCoverage)) ||
        artifact.profile.route !== undefined ||
        artifact.profile.browserClient ||
        artifact.moduleMocking.version !== 1 ||
        Object.keys(artifact.moduleMocking).length !== 2 ||
        artifact.moduleCache?.version !== 1 ||
        Object.keys(artifact.moduleCache).length !== 1 ||
        artifact.dynamicModuleMocking !== undefined ||
        artifact.cohort ||
        options.coverage ||
        options.collectOnly ||
        options.inspect ||
        options.setupFiles.length ||
        options.snapshotSerializers?.length ||
        options.entry.inSource ||
        options.entry.executionEnvironment)
    )
      throw new Error('Unsupported original CommonJS require reset activation')
    const productionOriginalCommonJsRequireReset =
      originalCommonJsRequireReset && artifact.profile.mode === 'production'
    const productionStaticRuntimeMocks =
      nativeRuntimeMocks &&
      artifact.profile.mode === 'production' &&
      artifact.profile.environment === 'node' &&
      artifact.profile.route === undefined
    if (
      (staticRuntimeMocks && originalInitialMocks) ||
      (nativeRuntimeMocks &&
        (artifact.moduleMocking?.version !== 1 ||
          Object.keys(artifact.moduleMocking).length !== 1))
    )
      throw new Error('Unsupported native static/runtime mock activation')
    if (
      options.collectOnly &&
      (options.coverage ||
        options.updateSnapshots ||
        (options.snapshotUpdateMode !== undefined &&
          options.snapshotUpdateMode !== 'none'))
    )
      throw new Error('Collection cannot request coverage or snapshot updates.')
    if (
      artifact.moduleMocking?.setupInputs !== undefined &&
      (artifact.moduleMocking.setupInputs !== 1 ||
        artifact.kind !== 'node' ||
        artifact.profile.environment !== 'node' ||
        artifact.profile.mode !== 'development' ||
        !options.setupFiles.length ||
        artifact.moduleMocking.cjsNamedSpy !== undefined ||
        artifact.moduleCache ||
        artifact.dynamicModuleMocking ||
        artifact.cohort)
    )
      throw new Error('Unsupported compiled setup module mock input profile')
    if (
      artifact.moduleMocking?.cjsNamedSpy !== undefined &&
      (artifact.moduleMocking.cjsNamedSpy !== 1 ||
        artifact.kind !== 'node' ||
        artifact.profile.environment !== 'node' ||
        artifact.profile.mode !== 'development' ||
        ('cohort' in artifact && artifact.cohort) ||
        options.setupFiles.length ||
        options.snapshotSerializers?.length ||
        options.coverage ||
        options.inspect ||
        options.entry.inSource ||
        options.entry.executionEnvironment)
    )
      throw new Error('Unsupported CommonJS named-import spy execution profile')
    if (
      options.inspect &&
      !(require('node:inspector') as typeof import('node:inspector')).url()
    )
      throw new Error('The requested test worker inspector did not start.')
    if (artifact.kind === 'browser')
      throw new Error(
        'Client Browser Mode artifacts require the parent-owned client executor, never a Node worker.'
      )
    assertArtifactProfile(artifact, options.entry)
    if (
      options.captureModuleStart !== undefined &&
      (options.captureModuleStart !== true ||
        options.preparePublicSnapshots !== true ||
        options.captureModuleCollected !== true ||
        options.captureTaskResults !== true)
    )
      throw new Error('Unsupported actual prepared-module execution role.')
    if (
      options.captureModuleCollected !== undefined &&
      (options.captureModuleCollected !== true ||
        options.captureTaskResults !== true ||
        artifact.kind !== 'node' ||
        artifact.profile.environment !== 'node' ||
        ('cohort' in artifact && artifact.cohort) ||
        options.collectOnly ||
        options.coverage ||
        options.customCoverage)
    )
      throw new Error('Unsupported actual collected-module execution role.')
    assertNodeProjectEnvironment(artifact, options)
    if (options.customCoverage) {
      const { assertCustomCoverageRequest } = await import(
        '../coverage/custom-runtime.js'
      )
      assertCustomCoverageRequest(artifact, {
        ...options,
        onCustomCoverage: async () => {},
      })
    }
    assertCompiledSetup(artifact, options.setupFiles)
    if (
      options.entry.environmentSourceHash !== undefined &&
      options.entry.environmentSourceHash !== artifact.sourceHash
    ) {
      throw new Error(
        'Test environment pragmas changed after discovery; discover the file again.'
      )
    }
    consoleCapture = installTestConsole({
      fileId: artifact.entryId,
      getTask: () => readConsoleTask?.(),
      publish: ({ timestamp, ...output }) =>
        event(
          {
            type: 'output',
            entryId: artifact.entryId,
            revision: artifact.revision,
            ...output,
          },
          timestamp
        ),
    })
    if (options.entry.executionEnvironment) {
      if (
        options.coverage &&
        options.entry.executionEnvironment.name !== 'node'
      )
        throw new Error(
          'Coverage for DOM and custom execution environments is not qualified.'
        )
      if (artifact.kind !== 'node' || artifact.profile.environment !== 'node')
        throw new Error(
          'DOM and custom execution environments require a Node compiler profile.'
        )
      environment = await openTestEnvironment(
        options.projectDir,
        options.entry.executionEnvironment,
        (error) => reportLateFailure(error),
        artifact.profile.route === undefined &&
          artifact.profile.browserClient === undefined &&
          !artifact.cohort
          ? true
          : undefined
      )
    }
    if (
      JSON.stringify(artifact.snapshotSerializers ?? []) !==
      JSON.stringify(options.snapshotSerializers ?? [])
    )
      throw new Error(
        'Snapshot serializers do not match the compiled test inputs'
      )
    if (
      artifact.moduleMocking &&
      (artifact.moduleMocking.version !== 1 ||
        !['node', 'rsc'].includes(artifact.profile.environment) ||
        artifact.kind !== artifact.profile.environment ||
        (artifact.profile.mode !== 'development' &&
          !artifact.moduleMocking.productionStaticFactory &&
          !productionStaticRuntimeMocks &&
          !productionOriginalCommonJsRequireReset) ||
        (options.coverage && artifact.moduleMocking.coverage?.version !== 1) ||
        ('moduleCache' in artifact &&
          artifact.moduleCache !== undefined &&
          !nativeRuntimeMocks &&
          !originalCommonJsRequireReset) ||
        (artifact.kind === 'rsc' &&
          (artifact.profile.route !== undefined ||
            options.setupFiles.length ||
            options.snapshotSerializers?.length ||
            options.entry.executionEnvironment ||
            options.entry.inSource)))
    ) {
      throw new Error('Unsupported compiled module mocking profile or version')
    }
    verifyProductionStaticMock =
      productionStaticRuntimeMocks || productionOriginalCommonJsRequireReset
        ? undefined
        : await captureProductionStaticMockClosure(artifact, options)
    if (
      artifact.kind === 'node' &&
      artifact.moduleCache &&
      (artifact.moduleCache.version !== 1 ||
        artifact.profile.environment !== 'node' ||
        (artifact.profile.mode !== 'development' &&
          !(
            artifact.profile.mode === 'production' &&
            artifact.profile.route === undefined &&
            ((!artifact.moduleMocking && !artifact.dynamicModuleMocking) ||
              productionStaticRuntimeMocks ||
              productionOriginalCommonJsRequireReset)
          )) ||
        (artifact.moduleMocking &&
          !nativeRuntimeMocks &&
          !originalCommonJsRequireReset) ||
        artifact.cohort ||
        options.coverage ||
        options.collectOnly ||
        options.setupFiles.length ||
        options.snapshotSerializers?.length ||
        options.entry.inSource ||
        options.entry.executionEnvironment)
    )
      throw new Error('Unsupported compiled module cache reset profile')
    if ('dynamicModuleMocking' in artifact && artifact.dynamicModuleMocking) {
      if (
        artifact.kind !== 'node' ||
        artifact.dynamicModuleMocking.version !== 1 ||
        (artifact.dynamicModuleMocking.staticMocks !== undefined &&
          !staticRuntimeMocks) ||
        (artifact.dynamicModuleMocking.nativeOriginalInitial !== undefined &&
          !originalInitialMocks) ||
        !artifact.moduleCache ||
        (artifact.moduleMocking && !nativeRuntimeMocks) ||
        artifact.cohort ||
        options.inspect
      )
        throw new Error(
          'Unsupported native runtime module mock ownership profile'
        )
    }
    const paths = [artifact.entryPath]
    if (artifact.kind === 'rsc')
      await validateRscEntryArtifact(artifact, artifactPath)
    for (const path of paths) {
      if (!artifact.files.includes(path))
        throw new Error(
          'Artifact closure is missing a required entry or manifest'
        )
      artifactPath(artifact.rootDir, path)
    }
    const useNativeNodeStackTrace =
      artifact.kind === 'node' &&
      artifact.profile.environment === 'node' &&
      artifact.profile.route === undefined &&
      artifact.profile.browserClient === undefined &&
      !artifact.cohort &&
      (!options.entry.executionEnvironment ||
        options.entry.executionEnvironment.name === 'node')
    // Shared through Next's process-global callback, including bundled mapper
    // copies. Keep the revision's files alive until this process has closed.
    const hostSourceMap = useNativeNodeStackTrace
      ? findSourceMap(__filename)
      : undefined
    setBundlerFindSourceMapImplementation(
      createArtifactSourceMapLookup(
        artifact,
        useNativeNodeStackTrace ? options.entry.file : undefined,
        hostSourceMap
          ? {
              compiledFile: __filename,
              payload: hostSourceMap.payload as ModernSourceMapPayload,
            }
          : undefined
      )
    )
    registrationOrigin = createArtifactRegistrationOriginMapper(
      artifact,
      options.entry.file
    )
    if (options.customCoverage) {
      const { startCustomCoverage } = await import(
        '../coverage/custom-runtime.js'
      )
      customCollector = await startCustomCoverage(options.customCoverage)
    }
    if (options.coverage) {
      // Start before even the emitted bootstrap is evaluated. One interval
      // retains setup, hooks and every retry, including superseded failures.
      if (options.coverage.kind === 'node-istanbul') {
        const { startIstanbulCoverage } = await import(
          '../coverage/istanbul-capture.js'
        )
        coverageCollector = await startIstanbulCoverage(
          artifact,
          options.projectDir
        )
      } else {
        const { startCoverage } = await import('../coverage/collector.js')
        coverageCollector = await startCoverage(artifact)
      }
    }
    // The emitted entry initializes the normal Turbopack runtime. Its spec import
    // is deferred until the bundle-local collector and manifests are installed.
    if (options.captureCompletedModuleResult) moduleFailurePhase = 'load'
    const entry = require(
      artifactPath(artifact.rootDir, artifact.entryPath)
    ) as {
      testRunner: typeof import('../runner')
      initializeModuleImportTracking?(): NonNullable<typeof importBinding>
      loadSetupModules?(sequence?: 'list' | 'parallel'): Promise<void>
      loadTestModule(): Promise<unknown>
      initializeModuleCache?(
        retire: NonNullable<typeof importBinding>['retireModules']
      ): NonNullable<typeof moduleCacheBinding>
      initializeDynamicModuleMocking?(
        options: Parameters<
          typeof import('../mocking/dynamic').initializeDynamicModuleMocking
        >[2]
      ): NonNullable<typeof dynamicMockBinding>
      browserTesting?: typeof import('../browser')
      mockTesting?: typeof import('../mocking/runtime')
    }
    moduleFailurePhase = undefined
    if (useNativeNodeStackTrace) {
      // Next's server formatter deliberately keeps raw stacks unmapped. The
      // entry bootstrap is complete; authored Node modules should instead use
      // the worker's original formatter and its already enabled source maps.
      restoreNodeStackTrace()
    }
    // The actual emitted entry has initialized Next's runtime env bindings.
    // Setup and authored modules remain deferred until collection below.
    restoreProjectEnvironment = applyNodeProjectEnvironment(options.env)
    if (
      options.setupFiles.length &&
      typeof entry.loadSetupModules !== 'function'
    ) {
      throw new Error('Compiled test entry is missing its setup module loader')
    }
    if (
      artifact.moduleMocking &&
      typeof entry.mockTesting?.initializeModuleMocking !== 'function'
    ) {
      throw new Error(
        'Compiled test entry is missing its module mocking runtime'
      )
    }
    let initializeRsc: (() => typeof rscBinding) | undefined
    if (artifact.kind === 'rsc') {
      const bindRsc = prepareCompiledRscEntry(
        entry as typeof entry & CompiledRscEntry,
        artifact,
        artifactPath
      )
      initializeRsc = () => bindRsc(cacheScope)
    }
    controller.signal.throwIfAborted()
    importBinding = entry.initializeModuleImportTracking?.()
    readConsoleTask = entry.testRunner.getConsoleTask
    routeRuntimeUnhandled =
      artifact.kind === 'node' && artifact.profile.environment === 'node'
        ? entry.testRunner.routeUnhandledRejection
        : undefined
    const assertionEnvironment =
      artifact.kind === 'node' &&
      artifact.profile.environment === 'node' &&
      artifact.profile.route === undefined &&
      artifact.profile.browserClient === undefined &&
      !artifact.cohort
        ? (environment?.assertionEnvironment ??
          (options.entry.executionEnvironment === undefined
            ? { name: 'node' }
            : undefined))
        : undefined
    file = entry.testRunner.initializeTestFile({
      ...(assertionEnvironment !== undefined ? { assertionEnvironment } : {}),
      publicTaskSelection: true,
      ...(carriedRetryOptions ? { carriedRetryOptions: true as const } : {}),
      ...(options.preparePublicSnapshots === true ||
      prepareReadOnlySelectedPublicFile
        ? { preparePublicSnapshots: true }
        : {}),
      ...(prepareReadOnlySelectedPublicFile
        ? { finalizePublicTaskModes: true as const }
        : {}),
      ...(v8ReadOnlySnapshots
        ? { finishReadOnlySnapshots: true as const }
        : {}),
      ...(prepareReadOnlyEmptyPublicFile
        ? { prepareEmptyPublicFile: true as const }
        : {}),
      ...(artifact.kind === 'node' &&
      artifact.profile.environment === 'node' &&
      artifact.profile.route === undefined &&
      artifact.profile.browserClient === undefined &&
      !artifact.cohort &&
      !options.coverage &&
      !options.customCoverage &&
      (!options.entry.executionEnvironment ||
        options.entry.executionEnvironment.name === 'node')
        ? {
            prepareEmptyPublicFile: true,
            ...(options.testNamePattern === undefined
              ? { finalizePublicTaskModes: true }
              : {}),
          }
        : {}),
      ...(artifact.kind === 'node' &&
      artifact.profile.environment === 'node' &&
      artifact.profile.mode === 'development'
        ? { omitFailedCollectionSnapshotSummary: true }
        : {}),
      ...(options.captureModuleCollected === true ||
      options.preparePublicSnapshots === true
        ? {
            onCollectionFailure: async (actualFile) => {
              const taskTree = captureReporterTaskTree(
                actualFile,
                undefined,
                file!.getPublishedTaskLocation
              )
              await event({
                type: 'file-collected',
                entryId: artifact.entryId,
                revision: artifact.revision,
                taskTree,
              })
              taskUpdates!.collected(
                actualFile,
                carriedRetryOptions ? taskTree : undefined
              )
              failedCollectedFile = actualFile
              failedCollectionObserved = true
            },
          }
        : {}),
      ...(options.coverage?.kind === 'node-istanbul' || v8CollectionCoverage
        ? { captureCollectionCoverage: true }
        : {}),
      ...(v8CollectionCoverage
        ? { captureSettledCollectionDeclarations: true }
        : {}),
      ...(v8CollectionRestoration
        ? { captureCollectionRestoration: true }
        : {}),
      ...(artifact.kind === 'node' && artifact.profile.environment === 'node'
        ? {
            onUnhandledRejection(
              reason,
              promise,
              recordedBody,
              recordedCoverageAfterAll
            ) {
              const active = activeNativeRejection
              if (
                active &&
                active.reason === reason &&
                active.promise === promise
              ) {
                active.recordedBody = recordedBody === true
                active.recordedCoverageAfterAll =
                  options.coverage?.kind === 'node-istanbul' &&
                  recordedCoverageAfterAll === true
              }
            },
          }
        : {}),
      snapshotBodyFailures:
        artifact.kind === 'node' && artifact.profile.environment === 'node',
      nativeBeforeEachAssertions:
        artifact.kind === 'node' && artifact.profile.environment === 'node',
      nativeAfterEachAssertions:
        artifact.kind === 'node' && artifact.profile.environment === 'node',
      nativeBeforeEachCleanupAssertions:
        artifact.kind === 'node' && artifact.profile.environment === 'node',
      fileId: artifact.entryId,
      filePath: options.entry.file,
      ...(options.includeTaskLocation
        ? {
            getTaskLocation: (error: Error) =>
              mapTestDeclarationLocation(error, options.entry.file),
          }
        : {}),
      collectOnly: options.collectOnly,
      updateSnapshots: options.updateSnapshots,
      snapshotUpdateMode: options.snapshotUpdateMode,
      snapshotFormat: options.snapshotFormat,
      mapSnapshotLocation,
      tags: options.tags,
      strictTags: options.strictTags,
      globals: options.globals,
      fakeTimers: options.fakeTimers,
      waitForImports: importBinding?.waitForImports,
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
    })
    if (v8ReadOnlySnapshots) {
      const method = Object.getOwnPropertyDescriptor(
        file,
        'getCompletedReadOnlySnapshotCoverageFailure'
      )
      if (!method || !('value' in method) || typeof method.value !== 'function')
        throw new Error(
          'Compiled test runner lacks read-only snapshot completion.'
        )
      const apply = Reflect.apply
      const getCompleted = method.value
      readOnlySnapshotCompletion = () => apply(getCompleted, file, [])
    }
    releaseNativeAssertionRecords = () =>
      file?.releaseNativeBodyRejectionRecords?.()
    if (
      options.preparePublicSnapshots === true &&
      (typeof file.getSnapshotPreparationFailure !== 'function' ||
        typeof file.prepareSnapshotsAfterFailedCollection !== 'function')
    )
      throw new Error(
        'The emitted file does not own actual public snapshot preparation.'
      )
    if (
      options.updateSnapshots &&
      typeof file.takeSnapshotUpdates !== 'function'
    ) {
      throw new Error(
        'Compiled test runner does not support staged snapshot updates'
      )
    }
    if (artifact.kind === 'node' && artifact.moduleCache) {
      if (!entry.initializeModuleCache || !importBinding?.retireModules)
        throw new Error(
          'Compiled module cache owner is missing its native manifest or import tracker'
        )
      moduleCacheBinding = entry.initializeModuleCache(
        importBinding.retireModules
      )
    }
    if (artifact.kind === 'node' && artifact.dynamicModuleMocking) {
      if (!entry.initializeDynamicModuleMocking || !importBinding?.trackImport)
        throw new Error(
          'Compiled runtime module mocks are missing their native manifest or import tracker'
        )
      dynamicMockBinding = entry.initializeDynamicModuleMocking({
        trackImport: importBinding.trackImport,
        onLateFailure(error) {
          reportLateFailure(error)
          if (publishingResult) process.exitCode = 1
        },
      })
    }
    if (artifact.moduleMocking) {
      mockBinding = entry.mockTesting!.initializeModuleMocking({
        onLateFailure(error) {
          reportLateFailure(error)
          if (publishingResult) process.exitCode = 1
        },
      })
    }
    rscBinding = initializeRsc?.()
    if (artifact.profile.environment === 'browser' && !options.collectOnly) {
      const browserOptions = options.browser
      if (!browserOptions || !entry.browserTesting) {
        throw new Error(
          'Browser execution requires emitted browser bindings and parent leases'
        )
      }
      // Validate the parent-retained root even if the spec never asks for a page.
      browserOutputDirectory(
        browserOptions.outputDir,
        options.runId,
        artifact.entryId,
        ''
      )
      browserBinding = entry.browserTesting.initializeBrowserTesting({
        getActiveAttempt: entry.testRunner.getActiveAttempt,
        async createFixture(attempt) {
          // Playwright/instant are infrastructure dependencies. Their runtime is
          // loaded only on demand here, outside the compiled application graph.
          const { createBrowserFixture } = await import('../browser/fixture.js')
          return createBrowserFixture({
            projectDir: options.projectDir,
            wsEndpoint: browserOptions.wsEndpoint,
            baseURL: browserOptions.baseURL,
            componentHost: browserOptions.componentHost,
            assertActiveAttempt() {
              // The same-bundle scope lookup reports a retained call from a
              // closed attempt even if user code catches the thrown error.
              if (entry.testRunner.getActiveAttempt() !== attempt) {
                throw new Error(
                  'Browser mount belongs to a different test attempt'
                )
              }
            },
            outputDir: browserOutputDirectory(
              browserOptions.outputDir,
              options.runId,
              artifact.entryId,
              attempt.id
            ),
            attempt,
            onAttachment(attachment) {
              return event({
                type: 'attachment',
                entryId: artifact.entryId,
                caseId: attempt.testId,
                attempt: {
                  id: attempt.id,
                  retry: attempt.retry,
                  repeat: attempt.repeat,
                },
                revision: artifact.revision,
                attachment,
              })
            },
          })
        },
      })
    }
    if (options.captureCompletedModuleResult) moduleFailurePhase = 'collection'
    try {
      await file.collect(async () => {
        // Both loaders belong to the emitted runtime. Setup hooks, matchers and
        // module state must reach the very same collector as the spec.
        controller.signal.throwIfAborted()
        await entry.loadSetupModules?.(options.sequence?.setupFiles ?? 'list')
        controller.signal.throwIfAborted()
        await entry.loadTestModule()
      })
    } catch (loadError) {
      if (
        options.preparePublicSnapshots === true &&
        failedCollectionObserved &&
        !controller.signal.aborted
      ) {
        try {
          await file.prepareSnapshotsAfterFailedCollection!()
          if (options.captureModuleStart === true)
            taskUpdates!.filePrepared(failedCollectedFile!)
        } catch (preparationError) {
          const observed = readPreparationFailure()
          if (!observed || observed.source !== 'failed-collection')
            throw new AggregateError(
              [loadError, preparationError],
              'Collection and snapshot preparation ownership failed.'
            )
          try {
            await publishPreparationFailure(observed)
          } catch (handoffError) {
            throw new AggregateError(
              [loadError, handoffError],
              'Collection and snapshot preparation handoff failed.'
            )
          }
        }
      }
      throw loadError
    }
    moduleFailurePhase = undefined
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
      status = 'passed'
    } else {
      phase = 'runtime'
      if (
        options.coverage?.kind === 'node-istanbul' &&
        typeof file.getCompletedCoverageFailures !== 'function'
      )
        throw new Error(
          'Istanbul completion requires the actual runner coverage observation.'
        )
      if (options.captureCompletedModuleResult) moduleFailurePhase = 'run'
      const result = await file.run({
        ...(taskUpdates && useNativeNodeStackTrace
          ? { captureSuiteErrorOrigins: true as const }
          : {}),
        ...(options.coverage?.kind === 'node-istanbul'
          ? { captureCoverageCompletion: true as const }
          : {}),
        ...(options.captureCompletedModuleResult
          ? { captureCompletedModuleResult: true as const }
          : {}),
        runId: options.runId,
        signal: controller.signal,
        ...(allowUserCancellation
          ? { userCancelSignal: userCancellation.signal }
          : {}),
        projectName: options.entry.projectName ?? options.entry.profile.id,
        projectDir: options.projectDir,
        attachmentsDir: options.attachmentsDir,
        getAnnotationLocation: (error) =>
          mapTestAnnotationLocation(error, options.entry.file),
        onAnnotation(context, annotation) {
          return event({
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
        getArtifactLocation: (error) =>
          mapTestArtifactLocation(error, options.entry.file),
        onArtifact(context, artifactRecord) {
          return event({
            type: 'test-artifact',
            entryId: artifact.entryId,
            caseId: context.testId,
            attempt: {
              id: context.id,
              retry: context.retry,
              repeat: context.repeat,
            },
            revision: artifact.revision,
            artifact: artifactRecord,
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
          if (lateFailures.has(error)) return
          // A callback arriving while the terminal message is in flight must still
          // make the parent reject a stale successful result at process close.
          if (publishingResult) process.exitCode = 1
          reportLateFailure(error)
        },
        ...(options.captureModuleStart === true
          ? {
              captureModuleStart: true as const,
              onFilePrepared(actualFile: import('../runner/tasks').File) {
                taskUpdates!.filePrepared(actualFile)
              },
            }
          : {}),
        onCollected: taskUpdates
          ? async (actualFile) => {
              collectedPublicationStage = 'capture'
              const taskTree = captureReporterTaskTree(
                actualFile,
                undefined,
                file!.getPublishedTaskLocation
              )
              collectedPublicationStage = 'send'
              await event({
                type: 'file-collected',
                entryId: artifact.entryId,
                revision: artifact.revision,
                taskTree,
              })
              collectedPublicationStage = 'complete'
              taskUpdates.collected(
                actualFile,
                carriedRetryOptions ? taskTree : undefined
              )
            }
          : undefined,
        onCollectedError: carriedRetryOptions
          ? (actualFile, operation, error) => {
              if (
                collectedPublicationStage !== 'capture' ||
                controller.signal.aborted ||
                process.connected !== true
              )
                throw error
              taskUpdates!.collectionFailed(actualFile, operation, error)
            }
          : undefined,
        onSuiteEnd(suiteResult, task, origins) {
          if (
            artifact.kind === 'node' &&
            artifact.profile.environment === 'node' &&
            (!options.entry.executionEnvironment ||
              options.entry.executionEnvironment.name === 'node')
          )
            for (const [index, failure] of suiteResult.errors.entries())
              reportedSuiteErrors.push({
                failure,
                suiteId: suiteResult.suiteId,
                index,
              })
          const serializedErrors = suiteResult.errors.map(runnerFailure)
          const projectResult =
            taskUpdates &&
            artifact.kind === 'node' &&
            artifact.profile.environment === 'node' &&
            (!options.entry.executionEnvironment ||
              options.entry.executionEnvironment.name === 'node') &&
            (useNativeNodeStackTrace ||
              suiteResult.errors.some(
                (failure) => failure.phase === 'aroundAll'
              ))
              ? createSuiteErrorResultProjection(
                  task,
                  createCapturedStackMapper((stack) =>
                    registrationOrigin?.(stack)
                  ),
                  origins,
                  (error) => registrationOrigin?.(error, 'registration')
                )
              : undefined
          const reportedTask =
            options.captureJUnitSuiteTasks === true
              ? captureJUnitSuiteTask(task, {
                  ...suiteResult,
                  errors: serializedErrors,
                })
              : undefined
          const completion = event({
            type: 'suite-end',
            ...suiteResult,
            revision: artifact.revision,
            errors: serializedErrors,
            ...(reportedTask ? { reportedTask } : {}),
          })
          return taskUpdates
            ? completion.then(() => taskUpdates.suiteEnd(task, projectResult))
            : completion
        },
        onCaseResult: taskUpdates
          ? (task, caseResult) => {
              assertUnexecutedCaseResult(caseResult)
              return taskUpdates.caseResult(
                task,
                structuredClone({
                  ...caseResult,
                  revision: artifact.revision,
                  errors: caseResult.errors.map(runnerFailure),
                })
              )
            }
          : undefined,
        onCaseStart(context) {
          taskUpdates?.caseStart(context.testId)
          unfinishedAttempts.add(context.id)
          return event({
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
          assertUnexecutedCaseResult(caseResult)
          unfinishedAttempts.delete(caseResult.attempt.id)
          if (
            caseResult.status === 'cancelled' ||
            caseResult.errors.some(
              (error) =>
                error.phase === 'cleanup' ||
                error.phase === 'afterEach' ||
                error.phase === 'runtime'
            )
          ) {
            snapshotHostComplete = false
            coverageComplete = false
          }
          return event({
            type: 'case-end',
            ...caseResult,
            revision: artifact.revision,
            errors: caseResult.errors.map(runnerFailure),
          })
        },
      })
      moduleFailurePhase = undefined
      if (options.captureCompletedModuleResult) {
        const completed = file.getCompletedModuleResult()
        if (!completed)
          throw new Error('Actual fulfilled module completion is missing.')
        moduleCompletion = {
          ...completed,
          version: 1,
          resultVersion: completed.version,
          kind: 'fulfilled',
          runId: options.runId,
          entryId: artifact.entryId,
          revision: artifact.revision,
        }
      }
      if (
        (options.coverage || options.customCoverage) &&
        result.interrupted !== false
      ) {
        snapshotHostComplete = false
        coverageComplete = false
      }
      for (const [index, failure] of result.errors.entries()) {
        if (
          (failure.phase === 'beforeAll' ||
            failure.phase === 'afterAll' ||
            failure.phase === 'cleanup' ||
            failure.phase === 'runtime') &&
          (options.coverage?.kind === 'node-istanbul' ||
            (v8ReadOnlySnapshots && failure.phase === 'runtime'))
        ) {
          snapshotHostComplete = false
          provisionalCoverageFailures.push(failure)
        }
        if (
          ((failure.phase === 'cleanup' || failure.phase === 'afterAll') &&
            options.coverage?.kind !== 'node-istanbul') ||
          (failure.phase === 'runtime' &&
            options.coverage?.kind !== 'node-istanbul' &&
            !v8ReadOnlySnapshots)
        ) {
          snapshotHostComplete = false
          coverageComplete = false
        }
        if (lateFailures.has(failure.error)) continue
        const owners = reportedSuiteErrors.filter(
          (item) => item.failure === failure
        )
        const serialized = runnerFailure(failure)
        const fileError =
          options.coverage?.kind === 'node-istanbul' &&
          failure.phase === 'cleanup'
        if (fileError)
          reportedFileErrors.push({ failure, index, diagnostic: serialized })
        await event({
          type: 'diagnostic',
          entryId: artifact.entryId,
          revision: artifact.revision,
          ...(owners.length === 1
            ? {
                suiteError: {
                  suiteId: owners[0].suiteId,
                  index: owners[0].index,
                },
              }
            : {}),
          ...(fileError ? { coverageFileError: { index } } : {}),
          diagnostic: serialized,
        })
      }
      // A successful retry replaces its failure; an earlier failed repeat still
      // fails the logical file result.
      for (const caseResult of result.cases)
        assertUnexecutedCaseResult(caseResult)
      const finalCases = getFinalCaseResults(result.cases)
      status =
        result.errors.length ||
        [...finalCases.values()].some((item) => item.status === 'failed')
          ? 'failed'
          : result.interrupted ||
              [...finalCases.values()].some(
                (item) => item.status === 'cancelled'
              )
            ? 'cancelled'
            : 'passed'
      if (controller.signal.aborted) status = 'cancelled'
    }
  } catch (error) {
    snapshotHostComplete = false
    const deferCollectionFailure =
      (options.coverage?.kind === 'node-istanbul' || v8CollectionCoverage) &&
      phase === 'collection' &&
      file !== undefined &&
      !controller.signal.aborted &&
      !lateFailures.has(error)
    if (!deferCollectionFailure) coverageComplete = false
    let preparationPropagation = false
    if (
      options.preparePublicSnapshots === true &&
      !sentPreparationFailure &&
      !controller.signal.aborted
    ) {
      const observed = readPreparationFailure()
      if (observed && observed.source === 'run') {
        const failure = await publishPreparationFailure(observed)
        // This bit comes only from the fresh actual run carrier, never equality
        // of the Error/undefined reason with an independent later failure.
        preparationPropagation = observed.propagatedThroughRun
        if (preparationPropagation && failure.outcome.kind === 'undefined')
          status = 'passed'
      }
    }
    if (controller.signal.aborted) status = 'cancelled'
    else if (!preparationPropagation && !lateFailures.has(error))
      await diagnostic(
        error,
        phase,
        undefined,
        deferCollectionFailure ? 0 : undefined
      )
    if (
      !controller.signal.aborted &&
      moduleFailurePhase &&
      moduleFailures?.has(error)
    )
      moduleCompletion = {
        version: 1,
        runId: options.runId,
        entryId: artifact.entryId,
        revision: artifact.revision,
        kind: 'unavailable',
        phase: moduleFailurePhase,
        failure: moduleFailures.get(error),
      }
  } finally {
    if (taskUpdates && !customCollector) {
      try {
        await taskUpdates.finish()
      } catch (error) {
        moduleHostCleanupComplete = false
        snapshotHostComplete = false
        coverageComplete = false
        status = 'failed'
        if (!lateFailures.has(error)) await diagnostic(error, 'cleanup')
      } finally {
        taskUpdates.dispose()
      }
    }
    try {
      await file?.dispose()
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      const observed = readCollectionRestoration()
      const deferRestoration =
        observed !== undefined &&
        provisionalCollectionFailure !== undefined &&
        observed.collectionError === provisionalCollectionFailure.error &&
        observed.disposalError === error &&
        !controller.signal.aborted &&
        !lateFailures.has(error)
      if (!deferRestoration) coverageComplete = false
      else observedCollectionRestoration = observed
      status = 'failed'
      if (!lateFailures.has(error))
        await diagnostic(
          error,
          'cleanup',
          undefined,
          deferRestoration ? 1 : undefined
        )
    }
    try {
      // Obsolete read-only snapshots can fail disposal after the primitive
      // has computed statistics. Preserve that evidence on failing files too.
      const snapshot = file?.getSnapshotSummary()
      if (snapshot)
        await event({
          type: 'snapshot-summary',
          entryId: artifact.entryId,
          revision: artifact.revision,
          snapshot,
        })
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      coverageComplete = false
      status = 'failed'
      if (!lateFailures.has(error)) await diagnostic(error, 'cleanup')
    }
    try {
      // Request and after() cleanup is owned by C/E/F and finishes before this
      // binding releases its file-scoped resources. The parent then removes the
      // disk lease only after this worker has exited.
      await rscBinding?.dispose()
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      await browserBinding?.dispose()
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      // Factories and original-module callbacks share the file realm. Keep the
      // registry alive through all file/request/browser teardown, then seal it.
      await mockBinding?.dispose()
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      dynamicMockBinding?.dispose()
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      moduleCacheBinding?.dispose()
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      importBinding?.dispose()
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      if (environment) {
        // Keep capture installed for teardown's own writes. Earlier console RPCs
        // must have reached their real parent callbacks before teardown runs.
        await consoleCapture?.flush()
        await drainParentConsole({
          runId: options.runId,
          entryId: artifact.entryId,
          revision: artifact.revision,
        })
      }
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      coverageComplete = false
      if (controller.signal.aborted && error === controller.signal.reason) {
        if (status !== 'failed') status = 'cancelled'
      } else {
        status = 'failed'
        if (!lateFailures.has(error)) await diagnostic(error, 'cleanup')
      }
    }
    try {
      await environment?.dispose()
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      restoreProjectEnvironment?.()
    } catch (error) {
      moduleHostCleanupComplete = false
      snapshotHostComplete = false
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
  }
  try {
    // Factory/original callbacks have retired; no publication precedes this check.
    await verifyProductionStaticMock?.()
  } catch (error) {
    moduleHostCleanupComplete = false
    snapshotHostComplete = false
    coverageComplete = false
    status = 'failed'
    await diagnostic(error, 'cleanup')
  }
  // Give already-rejected promises a turn to reach the unhandled-rejection
  // handler before publishing a successful file result.
  await new Promise<void>((resolveTurn) => setImmediate(resolveTurn))
  await lateFailures.flush()
  if (lateFailures.failed) status = 'failed'
  if (options.coverage) {
    const identity = {
      version: 1 as const,
      runId: options.runId,
      entryId: artifact.entryId,
      revision: artifact.revision,
    }
    let captured = false
    try {
      let settledSuiteErrors: { suiteId: string; index: number }[] | undefined
      let settledFileErrors:
        | {
            index: number
            diagnostic: ReturnType<typeof serializeDiagnostic>
          }[]
        | undefined
      if (provisionalRestorationFailure && v8CollectionRestoration) {
        const observed = readCollectionRestoration()
        if (
          !observed ||
          observed !== observedCollectionRestoration ||
          !provisionalCollectionFailure ||
          observed.collectionError !== provisionalCollectionFailure.error ||
          observed.disposalError !== provisionalRestorationFailure.error ||
          provisionalCollectionFailure.index !== 0 ||
          provisionalRestorationFailure.index !== 1 ||
          provisionalCoverageFailures.length ||
          reportedFileErrors.length ||
          reportedSuiteErrors.length
        )
          coverageComplete = false
        else
          settledFileErrors = [
            { index: 0, diagnostic: provisionalCollectionFailure.diagnostic },
            { index: 1, diagnostic: provisionalRestorationFailure.diagnostic },
          ]
      } else if (
        provisionalCollectionFailure &&
        (options.coverage.kind === 'node-istanbul' || v8CollectionCoverage)
      ) {
        const observed =
          typeof file?.getCompletedCollectionCoverageFailure === 'function'
            ? file.getCompletedCollectionCoverageFailure()
            : undefined
        const errorField =
          observed !== null &&
          typeof observed === 'object' &&
          !Array.isArray(observed) &&
          Reflect.ownKeys(observed).length === 1
            ? Object.getOwnPropertyDescriptor(observed, 'error')
            : undefined
        if (
          !errorField ||
          !('value' in errorField) ||
          errorField.value !== provisionalCollectionFailure.error ||
          provisionalCoverageFailures.length ||
          reportedFileErrors.length ||
          reportedSuiteErrors.length
        )
          coverageComplete = false
        else
          settledFileErrors = [
            {
              index: provisionalCollectionFailure.index,
              diagnostic: provisionalCollectionFailure.diagnostic,
            },
          ]
      } else if (options.coverage.kind === 'node-istanbul') {
        const observed = file!.getCompletedCoverageFailures()
        if (
          !observed ||
          observed.length !== provisionalCoverageFailures.length ||
          provisionalCoverageFailures.some(
            (failure) => !observed.includes(failure)
          )
        )
          coverageComplete = false
        else {
          settledSuiteErrors = []
          settledFileErrors = []
          for (const failure of observed) {
            const owners = reportedSuiteErrors.filter(
              (item) => item.failure === failure
            )
            const fileOwners = reportedFileErrors.filter(
              (item) => item.failure === failure
            )
            if (fileOwners.length === 1 && owners.length <= 1) {
              settledFileErrors.push({
                index: fileOwners[0].index,
                diagnostic: fileOwners[0].diagnostic,
              })
            } else if (owners.length === 1 && fileOwners.length === 0) {
              settledSuiteErrors.push({
                suiteId: owners[0].suiteId,
                index: owners[0].index,
              })
            } else if (
              !(
                owners.length === 0 &&
                fileOwners.length === 0 &&
                failure.phase === 'runtime' &&
                nativeCoverageOccurrences.filter(
                  (item) => item.afterAll && item.reason === failure.error
                ).length === 1 &&
                lateFailures.has(failure.error)
              )
            ) {
              coverageComplete = false
              break
            }
          }
        }
      }
      if (v8ReadOnlySnapshots && provisionalCoverageFailures.length) {
        const observed = readOnlySnapshotCompletion?.()
        const owners = reportedSuiteErrors.filter(
          (item) => item.failure === observed
        )
        if (
          observed === undefined ||
          provisionalCoverageFailures.length !== 1 ||
          provisionalCoverageFailures[0] !== observed ||
          owners.length !== 1 ||
          owners[0].suiteId !== artifact.entryId ||
          reportedSuiteErrors.length !== 1 ||
          provisionalCollectionFailure ||
          provisionalRestorationFailure ||
          reportedFileErrors.length ||
          lateFailures.failed
        )
          coverageComplete = false
        else
          settledSuiteErrors = [
            { suiteId: owners[0].suiteId, index: owners[0].index },
          ]
      }
      if (!coverageCollector)
        throw new Error('Test coverage collection did not start')
      const data = await coverageCollector.stop()
      await coverageCollector.dispose()
      // Inspector shutdown is asynchronous; retain the late-failure veto until
      // the terminal payload is published and the parent observes actual exit.
      await lateFailures.flush()
      captured = true
      if (
        !coverageComplete ||
        controller.signal.aborted ||
        (lateFailures.failed &&
          !canPublishNativeBodyFacts() &&
          !canPublishIstanbulNativeFacts()) ||
        unfinishedAttempts.size
      ) {
        throw new Error(
          'Test coverage is incomplete after interrupted execution or failed cleanup'
        )
      }
      coverage = {
        ...identity,
        complete: true,
        data,
        ...(settledSuiteErrors?.length ? { settledSuiteErrors } : {}),
        ...(settledFileErrors?.length ? { settledFileErrors } : {}),
      }
    } catch (error) {
      snapshotHostComplete = false
      status =
        captured && controller.signal.aborted && status !== 'failed'
          ? 'cancelled'
          : 'failed'
      if (!captured) await diagnostic(error, 'runtime')
      coverage = {
        ...identity,
        complete: false,
        error: serializeDiagnostic(error, { phase: 'runtime' }),
      }
    } finally {
      try {
        await coverageCollector?.dispose()
      } catch (error) {
        moduleHostCleanupComplete = false
        snapshotHostComplete = false
        status = 'failed'
        await diagnostic(error, 'cleanup')
        coverage = {
          ...identity,
          complete: false,
          error: serializeDiagnostic(error, { phase: 'cleanup' }),
        }
      }
    }
  }
  if (options.customCoverage) {
    const identity = {
      version: 1 as const,
      kind: 'custom' as const,
      runId: options.runId,
      entryId: artifact.entryId,
      revision: artifact.revision,
      provider: options.customCoverage.provider,
    }
    let captured = false
    try {
      if (!customCollector)
        throw new Error('Custom coverage collection did not start')
      const payload = await customCollector.take()
      if (customCoverageSuite) {
        if (
          !coverageComplete ||
          controller.signal.aborted ||
          unfinishedAttempts.size
        )
          throw new Error(
            'Custom coverage suite is incomplete after interruption'
          )
        await handOffCustomSuite({ ...identity, complete: true, payload })
      }
      // Keep regular task updates live. Only the final trailing drain belongs
      // after actual custom coverage capture and suite handoff, before stop.
      await finishCustomTaskUpdates()
      await customCollector.dispose()
      await lateFailures.flush()
      captured = true
      if (
        !coverageComplete ||
        controller.signal.aborted ||
        lateFailures.failed ||
        unfinishedAttempts.size
      )
        throw new Error(
          'Custom coverage is incomplete after interruption or failed cleanup'
        )
      customCoverage = { ...identity, complete: true, payload }
    } catch (error) {
      snapshotHostComplete = false
      status =
        captured && controller.signal.aborted && status !== 'failed'
          ? 'cancelled'
          : 'failed'
      if (!captured) await diagnostic(error, 'runtime')
      customCoverage = {
        ...identity,
        complete: false,
        error: serializeDiagnostic(error, { phase: 'runtime' }),
      }
    } finally {
      try {
        await finishCustomTaskUpdates()
      } finally {
        try {
          await customCollector?.dispose()
        } catch (error) {
          moduleHostCleanupComplete = false
          snapshotHostComplete = false
          status = 'failed'
          await diagnostic(error, 'cleanup')
          customCoverage = {
            ...identity,
            complete: false,
            error: serializeDiagnostic(error, { phase: 'cleanup' }),
          }
        }
      }
    }
  }
  try {
    await consoleCapture?.dispose()
  } catch (error) {
    moduleHostCleanupComplete = false
    snapshotHostComplete = false
    coverageComplete = false
    status = 'failed'
    await diagnostic(error, 'cleanup')
  }
  // Data captured earlier remains provisional through the final host drain.
  // Only the same closed BODY records can account for actual native events.
  if (
    coverage?.complete &&
    (!coverageComplete ||
      controller.signal.aborted ||
      (lateFailures.failed &&
        !canPublishNativeBodyFacts() &&
        !canPublishIstanbulNativeFacts()) ||
      unfinishedAttempts.size)
  )
    coverage = {
      version: 1,
      runId: options.runId,
      entryId: artifact.entryId,
      revision: artifact.revision,
      complete: false,
      error: serializeDiagnostic(
        new Error(
          'Test coverage is incomplete after interrupted execution or failed cleanup'
        ),
        { phase: 'runtime' }
      ),
    }
  publishingResult = true
  // Serialize staged bytes only. The parent owns the authoritative exit/cleanup
  // decision and commits after this realm has exited successfully.
  const cancelledSnapshotUpdates =
    allowUserCancellation &&
    userCancellation.signal.aborted &&
    options.snapshotUpdateMode === 'new'
      ? file?.takeSnapshotUpdates()
      : undefined
  if (
    allowUserCancellation &&
    userCancellation.signal.aborted &&
    options.snapshotUpdateMode === 'new' &&
    (!Array.isArray(cancelledSnapshotUpdates) ||
      cancelledSnapshotUpdates.length > 0)
  )
    throw new Error(
      'Cancelled coverage requires an actually empty snapshot update plan.'
    )
  const snapshotUpdates =
    cancelledSnapshotUpdates ??
    (options.updateSnapshots &&
    !(allowUserCancellation && userCancellation.signal.aborted) &&
    !controller.signal.aborted &&
    (status === 'passed' ||
      (status === 'failed' &&
        artifact.kind === 'node' &&
        artifact.profile.environment === 'node' &&
        snapshotHostComplete &&
        snapshotUnhandledClean &&
        !unfinishedAttempts.size &&
        file?.canPublishSnapshots()))
      ? file?.takeSnapshotUpdates()
      : undefined)
  await send({
    type: 'complete',
    ...(moduleCompletion ? { moduleCompletion } : {}),
    ...(options.captureCompletedModuleResult
      ? { moduleHostCleanupComplete }
      : {}),
    result: {
      entryId: artifact.entryId,
      status,
      durationMs: performance.now() - started,
    },
    ...(snapshotUpdates === undefined ? {} : { snapshotUpdates }),
    ...(coverage === undefined ? {} : { coverage }),
    ...(customCoverage === undefined ? {} : { customCoverage }),
    ...(collection && status === 'passed' && !controller.signal.aborted
      ? { collection }
      : {}),
  })
  await lateFailures.flush()
  if (allowUserCancellation && userCancellation.signal.aborted) {
    return async () => {
      // Native rejection records have been released by the caller. Keep actual
      // late failures observable through a final turn before the parent stops us.
      await new Promise<void>((resolveTurn) => setImmediate(resolveTurn))
      await lateFailures.flush()
      if (
        controller.signal.aborted ||
        process.exitCode ||
        !coverageComplete ||
        !coverage?.complete ||
        unfinishedAttempts.size
      )
        throw new Error('User cancellation could not finalize cleanly.')
      await send({
        type: 'user-cancellation-finalized',
        version: 1,
        runId: options.runId,
        entryId: artifact.entryId,
        revision: artifact.revision,
      })
      // IPC retains the process. No further cleanup or authored exit callback
      // runs before the parent validates the seal and requests actual SIGTERM.
      return true
    }
  }
}

process.on(
  'message',
  (message: {
    type: string
    input?: WorkerInput
    runId?: string
    entryId?: string
    revision?: string
    error?: { message: string; stack?: string }
  }) => {
    if (message.type === 'cancel')
      controller.abort(new Error('Test file cancelled'))
    else if (message.type === 'user-cancel')
      userCancellation.abort(new Error('Test run cancelled by the user.'))
    else if (message.type === 'console-drained') {
      const pending = pendingConsoleDrain
      if (
        !pending ||
        message.runId !== pending.runId ||
        message.entryId !== pending.entryId ||
        message.revision !== pending.revision
      ) {
        controller.abort(new Error('Mismatched console acknowledgement.'))
      } else if (message.error) {
        const error = new Error(message.error.message)
        if (message.error.stack) error.stack = message.error.stack
        pending.reject(error)
      } else pending.resolve()
    } else if (message.type === 'task-updates-drained') {
      const pending = pendingTaskUpdatesDrain
      if (
        !pending ||
        message.runId !== pending.runId ||
        message.entryId !== pending.entryId ||
        message.revision !== pending.revision
      ) {
        const error = new Error('Mismatched task update acknowledgement.')
        if (pending) pending.reject(error)
        else controller.abort(error)
      } else if (message.error) {
        const error = new Error(message.error.message)
        if (message.error.stack) error.stack = message.error.stack
        pending.reject(error)
      } else pending.resolve()
    } else if (message.type === 'custom-coverage-suite-received') {
      const pending = pendingCustomSuite
      if (
        !pending ||
        message.runId !== pending.completion.runId ||
        message.entryId !== pending.completion.entryId ||
        message.revision !== pending.completion.revision
      ) {
        controller.abort(
          new Error('Mismatched custom coverage acknowledgement.')
        )
      } else if (message.error) {
        const error = new Error(message.error.message)
        if (message.error.stack) error.stack = message.error.stack
        pending.reject(error)
      } else pending.resolve()
    } else if (message.type === 'run' && message.input && !running) {
      running = true
      run(message.input)
        .finally(() => {
          releaseNativeAssertionRecords?.()
          releaseNativeAssertionRecords = undefined
        })
        .then(async (finalizeCancellation) => {
          if (await finalizeCancellation?.()) return
          process.exit(process.exitCode ?? 0)
        })
        .catch((error) => {
          console.error(error)
          process.exit(1)
        })
    }
  }
)
process.once('disconnect', () => process.exit(1))

process.on('unhandledRejection', (error, promise) => {
  if (reportUnhandledRejection) reportUnhandledRejection(error, promise)
  else {
    console.error(error)
    process.exit(1)
  }
})
