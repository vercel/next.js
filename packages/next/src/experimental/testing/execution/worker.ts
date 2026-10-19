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
import type { ResultEvent, ResultStatus } from '../reporting/events'
import { getFinalCaseResults } from '../reporting/final-cases'
import type { RunnerFailure } from '../runner/lifecycle'
import type { WorkerInput, WorkerMessage } from './protocol'
import type { TestCoverageCompletion, TestFileCollection } from '../contracts'
import { setBundlerFindSourceMapImplementation } from '../../../server/patch-error-inspect'
import { createArtifactSourceMapLookup } from './source-maps'
import { createLateFailureSink } from './late-failures'
import { browserOutputDirectory } from './browser-output'
import { assertArtifactProfile } from './artifact-profile'
import { assertCompiledSetup } from './setup'
import { openTestEnvironment } from '../environments/runtime'

type EventPayload<T = ResultEvent> = T extends ResultEvent
  ? Omit<T, 'version' | 'runId' | 'timestamp'>
  : never

const realDateNow = Date.now.bind(Date)
const controller = new AbortController()
let running = false
let reportUnhandledRejection: ((reason: unknown) => void) | undefined

function send(message: WorkerMessage): Promise<void> {
  return new Promise((resolveSend, reject) => {
    if (!process.send) return reject(new Error('Test worker requires IPC'))
    process.send(message, (error: Error | null) =>
      error ? reject(error) : resolveSend()
    )
  })
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

async function run({ artifact, options, cacheScope }: WorkerInput) {
  const started = performance.now()
  const event = (payload: EventPayload) =>
    send({
      type: 'event',
      event: {
        ...payload,
        version: 1,
        runId: options.runId,
        timestamp: realDateNow(),
      } as ResultEvent,
    })
  const diagnostic = (
    error: unknown,
    phase: 'collection' | 'runtime' | 'cleanup',
    unhandled?: 'rejection'
  ) =>
    event({
      type: 'diagnostic',
      entryId: artifact.entryId,
      revision: artifact.revision,
      diagnostic: {
        ...serializeDiagnostic(error, { phase }),
        ...(unhandled ? { unhandled } : {}),
      },
    })
  const runnerFailure = (failure: RunnerFailure) =>
    serializeDiagnostic(failure.error, {
      phase: failure.phase === 'cleanup' ? 'cleanup' : 'runtime',
    })
  const unhandledRejections = new Set<unknown>()
  const lateFailures = createLateFailureSink<unknown>((error) =>
    diagnostic(
      error,
      'runtime',
      unhandledRejections.has(error) ? 'rejection' : undefined
    )
  )
  let collection: TestFileCollection | undefined
  let publishingResult = false
  // Keep the process handler installed through cleanup and terminal IPC. A
  // rejection fails the file without discarding already completed case facts.
  reportUnhandledRejection = (reason) => {
    unhandledRejections.add(reason)
    if (publishingResult) process.exitCode = 1
    lateFailures.report(reason)
  }
  let status: ResultStatus = 'failed'
  let coverageCollector:
    | Awaited<ReturnType<typeof import('../coverage/collector').startCoverage>>
    | undefined
  let customCollector:
    | Awaited<
        ReturnType<
          typeof import('../coverage/custom-runtime').startCustomCoverage
        >
      >
    | undefined
  let customCoverage: CustomCoverageCompletion | undefined
  let coverage: TestCoverageCompletion | undefined
  let coverageComplete = true
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
  let environment: Awaited<ReturnType<typeof openTestEnvironment>> | undefined
  let phase: 'collection' | 'runtime' = 'collection'
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
        (error) => lateFailures.report(error)
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
        ('moduleCache' in artifact && artifact.moduleCache !== undefined) ||
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
        artifact.profile.mode !== 'development' ||
        artifact.moduleMocking ||
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
        !artifact.moduleCache ||
        artifact.moduleMocking ||
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
    if (options.customCoverage) {
      const { startCustomCoverage } = await import(
        '../coverage/custom-runtime.js'
      )
      customCollector = await startCustomCoverage(options.customCoverage)
    }
    if (options.coverage) {
      // Start before even the emitted bootstrap is evaluated. One interval
      // retains setup, hooks and every retry, including superseded failures.
      const { startCoverage } = await import('../coverage/collector.js')
      coverageCollector = await startCoverage(artifact)
    }
    // The emitted entry initializes the normal Turbopack runtime. Its spec import
    // is deferred until the bundle-local collector and manifests are installed.
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
        })
      }
    }
    controller.signal.throwIfAborted()
    importBinding = entry.initializeModuleImportTracking?.()
    file = entry.testRunner.initializeTestFile({
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
          lateFailures.report(error)
          if (publishingResult) process.exitCode = 1
        },
      })
    }
    if (artifact.moduleMocking) {
      mockBinding = entry.mockTesting!.initializeModuleMocking({
        onLateFailure(error) {
          lateFailures.report(error)
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
    await file.collect(async () => {
      // Both loaders belong to the emitted runtime. Setup hooks, matchers and
      // module state must reach the very same collector as the spec.
      controller.signal.throwIfAborted()
      await entry.loadSetupModules?.(options.sequence?.setupFiles ?? 'list')
      controller.signal.throwIfAborted()
      await entry.loadTestModule()
    })
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
      const result = await file.run({
        runId: options.runId,
        signal: controller.signal,
        projectName: options.entry.profile.id,
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
          lateFailures.report(error)
        },
        onSuiteEnd(suiteResult) {
          return event({
            type: 'suite-end',
            ...suiteResult,
            revision: artifact.revision,
            errors: suiteResult.errors.map(runnerFailure),
          })
        },
        onCaseStart(context) {
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
          )
            coverageComplete = false
          return event({
            type: 'case-end',
            ...caseResult,
            revision: artifact.revision,
            errors: caseResult.errors.map(runnerFailure),
          })
        },
      })
      if (
        (options.coverage || options.customCoverage) &&
        result.interrupted !== false
      )
        coverageComplete = false
      for (const failure of result.errors) {
        if (
          failure.phase === 'cleanup' ||
          failure.phase === 'afterAll' ||
          failure.phase === 'runtime'
        )
          coverageComplete = false
        if (lateFailures.has(failure.error)) continue
        await event({
          type: 'diagnostic',
          entryId: artifact.entryId,
          revision: artifact.revision,
          diagnostic: runnerFailure(failure),
        })
      }
      // A successful retry replaces its failure; an earlier failed repeat still
      // fails the file and must veto snapshot publication.
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
    coverageComplete = false
    if (controller.signal.aborted) status = 'cancelled'
    else if (!lateFailures.has(error)) await diagnostic(error, phase)
  } finally {
    try {
      await file?.dispose()
    } catch (error) {
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
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      await browserBinding?.dispose()
    } catch (error) {
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      // Factories and original-module callbacks share the file realm. Keep the
      // registry alive through all file/request/browser teardown, then seal it.
      await mockBinding?.dispose()
    } catch (error) {
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      dynamicMockBinding?.dispose()
    } catch (error) {
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      moduleCacheBinding?.dispose()
    } catch (error) {
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      importBinding?.dispose()
    } catch (error) {
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
    try {
      await environment?.dispose()
    } catch (error) {
      coverageComplete = false
      status = 'failed'
      await diagnostic(error, 'cleanup')
    }
  }
  try {
    // Factory/original callbacks have retired; no publication precedes this check.
    await verifyProductionStaticMock?.()
  } catch (error) {
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
        lateFailures.failed ||
        unfinishedAttempts.size
      ) {
        throw new Error(
          'Test coverage is incomplete after interrupted execution or failed cleanup'
        )
      }
      coverage = { ...identity, complete: true, data }
    } catch (error) {
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
  publishingResult = true
  // Serialize staged bytes only. The parent owns the authoritative exit/cleanup
  // decision and commits after this realm has exited successfully.
  const snapshotUpdates =
    options.updateSnapshots && status === 'passed' && !controller.signal.aborted
      ? file?.takeSnapshotUpdates()
      : undefined
  await send({
    type: 'complete',
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
}

process.on('message', (message: { type: string; input?: WorkerInput }) => {
  if (message.type === 'cancel')
    controller.abort(new Error('Test file cancelled'))
  else if (message.type === 'run' && message.input && !running) {
    running = true
    run(message.input).then(
      () => process.exit(process.exitCode ?? 0),
      (error) => {
        console.error(error)
        process.exit(1)
      }
    )
  }
})
process.once('disconnect', () => process.exit(1))

process.on('unhandledRejection', (error) => {
  if (reportUnhandledRejection) reportUnhandledRejection(error)
  else {
    console.error(error)
    process.exit(1)
  }
})
