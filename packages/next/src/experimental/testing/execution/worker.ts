import '../../../server/require-hook'
import '../../../server/node-environment'

import { isAbsolute, relative, resolve, sep } from 'path'
import type { ActionManifest } from '../../../build/webpack/plugins/flight-client-entry-plugin'
import type { ClientReferenceManifest } from '../../../build/webpack/plugins/flight-manifest-plugin'
import {
  evalManifest,
  loadManifest,
} from '../../../server/load-manifest.external'
import { serializeSourceMappedDiagnostic as serializeDiagnostic } from '../reporting/source-mapped-diagnostics'
import type { ResultEvent, ResultStatus } from '../reporting/events'
import type { RunnerFailure } from '../runner/lifecycle'
import type { WorkerInput, WorkerMessage } from './protocol'
import type { TestCoverageCompletion } from '../contracts'
import { setBundlerFindSourceMapImplementation } from '../../../server/patch-error-inspect'
import { createArtifactSourceMapLookup } from './source-maps'
import { createLateFailureSink } from './late-failures'
import { browserOutputDirectory } from './browser-output'
import { assertArtifactProfile } from './artifact-profile'
import { assertCompiledSetup } from './setup'

type EventPayload<T = ResultEvent> = T extends ResultEvent
  ? Omit<T, 'version' | 'runId' | 'timestamp'>
  : never

const controller = new AbortController()
let running = false

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
        timestamp: Date.now(),
      } as ResultEvent,
    })
  const diagnostic = (
    error: unknown,
    phase: 'collection' | 'runtime' | 'cleanup'
  ) =>
    event({
      type: 'diagnostic',
      entryId: artifact.entryId,
      revision: artifact.revision,
      diagnostic: serializeDiagnostic(error, { phase }),
    })
  const runnerFailure = (failure: RunnerFailure) =>
    serializeDiagnostic(failure.error, {
      phase: failure.phase === 'cleanup' ? 'cleanup' : 'runtime',
    })
  const lateFailures = createLateFailureSink((error) =>
    diagnostic(error, 'runtime')
  )
  let publishingResult = false
  let status: ResultStatus = 'failed'
  let coverageCollector:
    | Awaited<ReturnType<typeof import('../coverage/collector').startCoverage>>
    | undefined
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
  let phase: 'collection' | 'runtime' = 'collection'
  let mockBinding:
    | ReturnType<typeof import('../mocking/runtime').initializeModuleMocking>
    | undefined
  try {
    assertArtifactProfile(artifact, options.entry)
    assertCompiledSetup(artifact, options.setupFiles)
    if (
      artifact.moduleMocking &&
      (artifact.moduleMocking.version !== 1 ||
        artifact.kind !== 'node' ||
        artifact.profile.environment !== 'node' ||
        artifact.profile.mode !== 'development')
    ) {
      throw new Error('Unsupported compiled module mocking profile or version')
    }
    const paths = [artifact.entryPath]
    if (artifact.kind === 'rsc') {
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
      loadSetupModules?(): Promise<void>
      loadTestModule(): Promise<unknown>
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
        page: artifact.manifestPage,
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
    file = entry.testRunner.initializeTestFile({
      fileId: artifact.entryId,
      filePath: options.entry.file,
      updateSnapshots: options.updateSnapshots,
    })
    if (
      options.updateSnapshots &&
      typeof file.takeSnapshotUpdates !== 'function'
    ) {
      throw new Error(
        'Compiled test runner does not support staged snapshot updates'
      )
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
    if (artifact.profile.environment === 'browser') {
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
      await entry.loadSetupModules?.()
      controller.signal.throwIfAborted()
      await entry.loadTestModule()
    })
    controller.signal.throwIfAborted()
    phase = 'runtime'
    const result = await file.run({
      runId: options.runId,
      signal: controller.signal,
      testTimeout: options.testTimeout,
      hookTimeout: options.hookTimeout,
      onLateFailure(error) {
        if (lateFailures.has(error)) return
        // A callback arriving while the terminal message is in flight must still
        // make the parent reject a stale successful result at process close.
        if (publishingResult) process.exitCode = 1
        lateFailures.report(error)
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
    if (options.coverage && result.interrupted !== false)
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
    // Earlier failed retries remain events; only the final attempt determines
    // the file outcome.
    const finalCases = new Map(result.cases.map((item) => [item.caseId, item]))
    status =
      result.errors.length ||
      [...finalCases.values()].some((item) => item.status === 'failed')
        ? 'failed'
        : 'passed'
    if (controller.signal.aborted) status = 'cancelled'
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
  console.error(error)
  process.exit(1)
})
