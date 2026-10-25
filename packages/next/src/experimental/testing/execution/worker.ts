import { createReporterTaskUpdates } from '../reporting/task-updates'
import { captureReporterTaskTree } from '../reporting/live-tasks'
import { captureProductionStaticMockClosure } from '../mocking/production-artifact'
import type { CustomCoverageCompletion } from '../coverage/custom-types'
import '../../../server/require-hook'
import '../../../server/node-environment'

import { readFile } from 'fs/promises'
import { validateCompiledTestRoute } from '../rsc/route'
import { isAbsolute, relative, resolve, sep } from 'path'
import type { ActionManifest } from '../../../build/webpack/plugins/flight-client-entry-plugin'
import type { ClientReferenceManifest } from '../../../build/webpack/plugins/flight-manifest-plugin'
import {
  evalManifest,
  loadManifest,
} from '../../../server/load-manifest.external'
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
import type { RscTestingBindings } from '../rsc'
import { setBundlerFindSourceMapImplementation } from '../../../server/patch-error-inspect'
import { createArtifactSourceMapLookup } from './source-maps'
import { createArtifactRegistrationOriginMapper } from './registration-origin'
import { createLateFailureSink } from './late-failures'
import { browserOutputDirectory } from './browser-output'
import { assertArtifactProfile } from './artifact-profile'
import { assertCompiledSetup } from './setup'
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
  const moduleFailures = options.captureCompletedModuleResult
    ? new Map<unknown, ReturnType<typeof serializeDiagnostic>>()
    : undefined
  const event = (payload: EventPayload, timestamp = realDateNow()) =>
    send({
      type: 'event',
      event: {
        ...payload,
        version: 1,
        runId: options.runId,
        timestamp,
      } as ResultEvent,
    })
  const diagnostic = (
    error: unknown,
    phase: 'collection' | 'runtime' | 'cleanup',
    unhandled?: 'rejection'
  ) => {
    const failure = {
      ...serializeDiagnostic(error, { phase }),
      ...(unhandled ? { unhandled } : {}),
    }
    moduleFailures?.set(error, failure)
    return event({
      type: 'diagnostic',
      entryId: artifact.entryId,
      revision: artifact.revision,
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
        ? registrationOrigin?.(failure.registrationError)
        : undefined,
    })
  const reportedSuiteErrors: {
    failure: RunnerFailure
    suiteId: string
    index: number
  }[] = []
  const taskUpdates = options.captureTaskResults
    ? createReporterTaskUpdates<CaseResult>({
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
  try {
    const staticRuntimeMocks =
      artifact.kind === 'node' &&
      artifact.dynamicModuleMocking?.staticMocks === 1
    if (
      staticRuntimeMocks &&
      (artifact.moduleMocking?.version !== 1 ||
        Object.keys(artifact.moduleMocking).length !== 1)
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
        (error) => reportLateFailure(error)
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
          !artifact.moduleMocking.productionStaticFactory) ||
        (options.coverage && artifact.moduleMocking.coverage?.version !== 1) ||
        ('moduleCache' in artifact &&
          artifact.moduleCache !== undefined &&
          !staticRuntimeMocks) ||
        (artifact.kind === 'rsc' &&
          (artifact.profile.route !== undefined ||
            options.setupFiles.length ||
            options.snapshotSerializers?.length ||
            options.entry.executionEnvironment ||
            options.entry.inSource)))
    ) {
      throw new Error('Unsupported compiled module mocking profile or version')
    }
    verifyProductionStaticMock = await captureProductionStaticMockClosure(
      artifact,
      options
    )
    if (
      artifact.kind === 'node' &&
      artifact.moduleCache &&
      (artifact.moduleCache.version !== 1 ||
        artifact.profile.environment !== 'node' ||
        (artifact.profile.mode !== 'development' &&
          !(
            artifact.profile.mode === 'production' &&
            artifact.profile.route === undefined &&
            !artifact.moduleMocking &&
            !artifact.dynamicModuleMocking
          )) ||
        (artifact.moduleMocking && !staticRuntimeMocks) ||
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
        !artifact.moduleCache ||
        (artifact.moduleMocking && !staticRuntimeMocks) ||
        artifact.cohort ||
        options.inspect
      )
        throw new Error(
          'Unsupported native runtime module mock ownership profile'
        )
    }
    const paths = [artifact.entryPath]
    if (artifact.kind === 'rsc') {
      if (artifact.profile.route !== undefined) {
        validateCompiledTestRoute(artifact.route, artifact.profile)
        if (!artifact.files.includes(artifact.route!.metadataPath))
          throw new Error('Missing immutable RSC route sidecar')
        const nativeRoute = JSON.parse(
          await readFile(
            artifactPath(artifact.rootDir, artifact.route!.metadataPath),
            'utf8'
          )
        )
        const { metadataPath: _, ...routeFacts } = artifact.route!
        if (JSON.stringify(nativeRoute) !== JSON.stringify(routeFacts))
          throw new Error('RSC route sidecar and artifact facts differ')
      } else if (artifact.route)
        throw new Error(
          'Route-less RSC artifact contains unexpected route metadata'
        )
      paths.push(
        artifact.manifests.clientReference,
        artifact.manifests.serverActions
      )
    }
    for (const path of paths) {
      if (!artifact.files.includes(path))
        throw new Error(
          'Artifact closure is missing a required entry or manifest'
        )
      artifactPath(artifact.rootDir, path)
    }
    // Shared through Next's process-global callback, including bundled mapper
    // copies. Keep the revision's files alive until this process has closed.
    setBundlerFindSourceMapImplementation(
      createArtifactSourceMapLookup(artifact)
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
      const rscEntry = entry as typeof entry & {
        ComponentMod: typeof import('../../../server/app-render/entry-base')
        ConsumerMod: typeof import('../rsc/consumer')
        rscTesting?: typeof import('../rsc')
        createRouteEntrypoint?: typeof import('../../../build/templates/app-test').createRouteEntrypoint
        initializeRuntime(): void
        setManifestsSingleton: typeof import('../../../server/app-render/manifests-singleton').setManifestsSingleton
      }
      // Only RSC artifacts initialize React/Flight loaders, manifests and fetch.
      // Node entries contain neither these exports nor placeholder manifests.
      if (typeof rscEntry.initializeRuntime !== 'function') {
        throw new Error(
          'Compiled RSC test entry is missing runtime initialization'
        )
      }
      rscEntry.initializeRuntime()
      const manifest = evalManifest<{
        __RSC_MANIFEST: Record<string, ClientReferenceManifest>
      }>(artifactPath(artifact.rootDir, artifact.manifests.clientReference))
        .__RSC_MANIFEST[artifact.manifestPage]
      if (!manifest) {
        throw new Error(
          `Missing client reference manifest for ${artifact.manifestPage}`
        )
      }
      rscEntry.setManifestsSingleton({
        page: artifact.route?.page ?? artifact.manifestPage,
        clientReferenceManifest: manifest,
        serverActionsManifest: loadManifest<ActionManifest>(
          artifactPath(artifact.rootDir, artifact.manifests.serverActions)
        ),
      })
      rscEntry.ComponentMod.patchFetch()
      initializeRsc = () => {
        if (!rscEntry.rscTesting) return undefined
        const optionalManifestPath = (manifestPath: string | undefined) => {
          if (manifestPath === undefined) return undefined
          if (!artifact.files.includes(manifestPath)) {
            throw new Error(
              'Artifact closure is missing a declared cache manifest'
            )
          }
          return artifactPath(artifact.rootDir, manifestPath)
        }
        return rscEntry.rscTesting.initializeRscTesting({
          ComponentMod: rscEntry.ComponentMod,
          ConsumerMod: rscEntry.ConsumerMod,
          clientReferenceManifest: manifest,
          requestContext: artifact.requestContext,
          profile: artifact.profile,
          manifestPage: artifact.manifestPage,
          route: artifact.route,
          getActiveAttempt: entry.testRunner.getActiveAttempt,
          cacheScope,
          previewPropsPath: optionalManifestPath(
            artifact.manifests.previewProps
          ),
          prerenderManifestPath: optionalManifestPath(
            artifact.manifests.prerender
          ),
          ...(artifact.route && artifact.requestContext?.routeRenderOpts
            ? {
                routeRendering: {
                  ComponentMod: (() => {
                    if (typeof rscEntry.createRouteEntrypoint !== 'function') {
                      throw new Error(
                        'Full route rendering requires the emitted AppPage entrypoint.'
                      )
                    }
                    return rscEntry.createRouteEntrypoint(
                      artifact.route.page,
                      artifact.route.pathname
                    )
                  })(),
                  buildManifest: loadManifest<
                    NonNullable<
                      RscTestingBindings['routeRendering']
                    >['buildManifest']
                  >(optionalManifestPath(artifact.manifests.routeBuild)!),
                  nextFontManifest: loadManifest<
                    NonNullable<
                      NonNullable<
                        RscTestingBindings['routeRendering']
                      >['nextFontManifest']
                    >
                  >(optionalManifestPath(artifact.manifests.routeFont)!),
                  reactLoadableManifest: loadManifest<
                    NonNullable<
                      RscTestingBindings['routeRendering']
                    >['reactLoadableManifest']
                  >(optionalManifestPath(artifact.manifests.routeLoadable)!),
                },
              }
            : {}),
        })
      }
    }
    controller.signal.throwIfAborted()
    importBinding = entry.initializeModuleImportTracking?.()
    readConsoleTask = entry.testRunner.getConsoleTask
    routeRuntimeUnhandled =
      artifact.kind === 'node' && artifact.profile.environment === 'node'
        ? entry.testRunner.routeUnhandledRejection
        : undefined
    file = entry.testRunner.initializeTestFile({
      publicTaskSelection: true,
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
    releaseNativeAssertionRecords = () =>
      file?.releaseNativeBodyRejectionRecords?.()
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
    await file.collect(async () => {
      // Both loaders belong to the emitted runtime. Setup hooks, matchers and
      // module state must reach the very same collector as the spec.
      controller.signal.throwIfAborted()
      await entry.loadSetupModules?.(options.sequence?.setupFiles ?? 'list')
      controller.signal.throwIfAborted()
      await entry.loadTestModule()
    })
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
        onCollected: taskUpdates
          ? async (actualFile) => {
              await event({
                type: 'file-collected',
                entryId: artifact.entryId,
                revision: artifact.revision,
                taskTree: captureReporterTaskTree(
                  actualFile,
                  undefined,
                  file!.getPublishedTaskLocation
                ),
              })
              taskUpdates.collected(actualFile)
            }
          : undefined,
        onSuiteEnd(suiteResult, task) {
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
          const completion = event({
            type: 'suite-end',
            ...suiteResult,
            revision: artifact.revision,
            errors: suiteResult.errors.map(runnerFailure),
          })
          return taskUpdates
            ? completion.then(() => taskUpdates.suiteEnd(task))
            : completion
        },
        onCaseResult: taskUpdates
          ? (task, caseResult) =>
              taskUpdates.caseResult(
                task,
                structuredClone({
                  ...caseResult,
                  revision: artifact.revision,
                  errors: caseResult.errors.map(runnerFailure),
                })
              )
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
          options.coverage?.kind === 'node-istanbul'
        ) {
          snapshotHostComplete = false
          provisionalCoverageFailures.push(failure)
        }
        if (
          ((failure.phase === 'cleanup' || failure.phase === 'afterAll') &&
            options.coverage?.kind !== 'node-istanbul') ||
          (failure.phase === 'runtime' &&
            options.coverage?.kind !== 'node-istanbul')
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
    coverageComplete = false
    if (controller.signal.aborted) status = 'cancelled'
    else if (!lateFailures.has(error)) await diagnostic(error, phase)
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
    if (taskUpdates) {
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
      coverageComplete = false
      status = 'failed'
      if (!lateFailures.has(error)) await diagnostic(error, 'cleanup')
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
      if (options.coverage.kind === 'node-istanbul') {
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
    else if (message.type === 'custom-coverage-suite-received') {
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
