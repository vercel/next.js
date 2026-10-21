import {
  createRuntimeConfigurationPlan,
  assertRuntimeConfigurationPlan,
  assertRuntimeConfigurationSelection,
  prepareRuntimeConfigurationReceipt,
  assertRuntimeConfigurationReceipts,
  type RuntimeConfigurationPlan,
  type RuntimeConfigurationReceipt,
} from './coverage/runtime-configuration'
import {
  createCoverageSourcePlan,
  assertCoverageSourcePlan,
  assertCompilerSourceCoverage,
  type CoverageSourcePlan,
} from './coverage/source-analysis-plan'
import { analyzeCompiledCoverageSource } from './coverage/source-analysis'
import type {
  CustomCoverageRequest,
  CustomCoverageFact,
} from './coverage/custom-types'
import { assertCustomCoverageFacts } from './coverage/custom-facts'
import { assertCustomCoverageCompletion } from './coverage/custom-runtime'
import { randomUUID } from 'crypto'
import { isDeepStrictEqual } from 'util'
import type {
  StandardCoverageOptions,
  StandardFileCoverage,
  CompiledCoverageSource,
  CompilerSourceCoverage,
} from './coverage/types'
import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { isAbsolute, join, relative } from 'path'
import type {
  CompiledTestArtifact,
  ExecuteTest,
  ExecuteTestCohort,
  TestEntry,
  TestCompilerSessionOptions,
  TestFileCollection,
} from './contracts'
import { requireTestCapability } from './capabilities'
import { forEachTestFile, parseMaxWorkers } from './scheduling'
import { shuffle, shuffleFiles } from './runner/sequence'
import { assertTestFileCollections } from './execution/collection'
import type { DiscoveredTestProject } from './discovery'
import type { ResultEvent, SerializedDiagnostic } from './reporting/events'
import { serializeDiagnostic } from './reporting/diagnostics'
import { getFinalCaseResults } from './reporting/final-cases'
import {
  createTestReporter,
  type TestReporterOptions,
} from './reporting/reporter'
import {
  commitSnapshotUpdates,
  resolveSnapshotUpdateMode,
  type SnapshotUpdate,
  type SnapshotUpdateMode,
} from './assertions/snapshots'

interface PreparedTest {
  entry: TestEntry
  artifact: CompiledTestArtifact
  started: number
  coverageLease?: () => void
}

export interface RunTestsOptions {
  captureTaskResults?: boolean
  compilerTransforms?: Record<
    string,
    import('./compiler/transform-broker').CompilerTransformDescriptor
  >
  signal: AbortSignal
  collectOnly?: boolean
  write(text: string): void
  reporter?: Omit<TestReporterOptions, 'write' | 'projectDir' | 'fileCount'>
  coverage?: boolean
  standardCoverageOptions?: StandardCoverageOptions
  /** Parent-issued source/profile selection; compiler children cannot authorize themselves. */
  coverageSourcePlan?: CoverageSourcePlan
  /** Derived only from the existing isolated one-shot compiler request. */
  nodeTypeScriptImportCoverage?: boolean
  runtimeConfigurationPlan?: RuntimeConfigurationPlan
  coverageInputs?: readonly string[]
  includeUnimportedCoverage?: boolean
  /** Separate parent broker channel; no runtime capture or child-derived declaration facts. */
  onCoverageSource?: (
    compiled: CompiledCoverageSource,
    signal: AbortSignal
  ) => Promise<void>
  customCoverageRequests?: Record<string, CustomCoverageRequest>
  inspect?: string
  inspectBrk?: boolean
  updateSnapshots?: boolean
  snapshotUpdateMode?: SnapshotUpdateMode
  testNamePattern?: string | RegExp
  passWithNoTests?: boolean
  /** Selected specification IDs before CLI sharding/file sequencing. */
  specificationOrder?: readonly string[]
  /** Failures already finalized by an outer profile coordinator. */
  bailFailures?: number
  /** Upper bound on fresh file workers; compilers and browser servers stay serial. */
  maxWorkers?: number
  /** Public one-shot Node/RSC runs supervise the compiler as well as workers. */
  isolateProjects?: boolean
  /** Watch uses a parent-owned execution broker; compilation stays in this process. */
  execute?: ExecuteTest
  /** The independent broker owns application/browser leases across compiler crashes. */
  brokerOwnsBrowser?: boolean
  /** A supervisor must retain the whole shared cohort process independently. */
  executeCohort?: ExecuteTestCohort
  allocateArtifact?: TestCompilerSessionOptions['allocateArtifact']
  /** Watch forwards events to its parent, which seals the authoritative run end. */
  onEvent?: (event: ResultEvent) => void
}

/** Sequence real compiler/executor producers; compilation never owns evaluation. */
export async function runTests(
  projectDir: string,
  projects: DiscoveredTestProject[],
  options: RunTestsOptions
) {
  if (options.standardCoverageOptions && !options.coverage)
    throw new Error('Standard coverage options require coverage collection.')
  if (options.collectOnly && options.coverage)
    throw new Error('Collection cannot request coverage or snapshot updates.')
  const standardCoverage: StandardFileCoverage[] = []
  const compilerSourceCoverage: CompilerSourceCoverage[] = []
  const runtimeConfigurationReceipts: RuntimeConfigurationReceipt[] = []
  if (
    (options.coverageSourcePlan ||
      options.onCoverageSource ||
      options.runtimeConfigurationPlan) &&
    !options.standardCoverageOptions
  )
    throw new Error(
      'Compiler source analysis requires standard coverage options'
    )
  const coverageSourcePlan = options.standardCoverageOptions
    ? (options.coverageSourcePlan ??
      (await createCoverageSourcePlan({
        projectDir,
        projects,
        config: options.standardCoverageOptions,
        inputs: options.coverageInputs,
        includeUnimported: options.includeUnimportedCoverage,
        signal: options.signal,
      })))
    : { version: 1 as const, requests: [], inputs: [] }
  await assertCoverageSourcePlan(coverageSourcePlan, options.signal)
  const runtimeConfigurationPlan = options.standardCoverageOptions
    ? options.runtimeConfigurationPlan
      ? structuredClone(options.runtimeConfigurationPlan)
      : await createRuntimeConfigurationPlan({
          projectDir,
          projects,
          inputs: options.coverageInputs,
          signal: options.signal,
        })
    : undefined
  if (runtimeConfigurationPlan) {
    await assertRuntimeConfigurationPlan(
      runtimeConfigurationPlan,
      options.signal
    )
    assertRuntimeConfigurationSelection(
      runtimeConfigurationPlan,
      projectDir,
      projects
    )
  }
  const customCoverage: CustomCoverageFact[] = []
  if (options.customCoverageRequests) {
    if (
      options.coverage ||
      options.collectOnly ||
      options.inspect ||
      resolveSnapshotUpdateMode(options) === 'all'
    )
      throw new Error(
        'Custom coverage requires a one-shot execution without V8, collection, debugging or snapshot updates.'
      )
    for (const id of Object.keys(options.customCoverageRequests))
      if (
        !projects.some(
          (project) => project.profile.id === id && project.customCoverage
        )
      )
        throw new Error('Unrequested custom coverage project.')
  }
  for (const project of projects)
    if (project.customCoverage && project.entries.length) {
      if (
        !options.customCoverageRequests?.[project.profile.id] ||
        project.isolate === false ||
        project.profile.environment !== 'node' ||
        project.profile.mode !== 'development' ||
        project.profile.route ||
        project.executionEnvironment ||
        project.typecheck?.enabled ||
        project.entries.some(
          (entry) => entry.executionEnvironment || entry.typecheck
        )
      )
        throw new Error(
          'Custom coverage requires a parent-owned provider session and isolated development Node files.'
        )
    }
  const maxWorkers = parseMaxWorkers(options.maxWorkers ?? 1)
  if (options.customCoverageRequests && maxWorkers !== 1)
    throw new Error('Custom coverage currently requires serial file execution.')
  if (
    options.inspect &&
    (maxWorkers !== 1 || options.collectOnly || options.coverage)
  )
    throw new Error(
      'Inspecting tests requires serial execution without collection or coverage.'
    )
  for (const project of projects) {
    if (project.isolate !== false || !project.entries.length) continue
    if (options.executeCohort && !options.allocateArtifact)
      throw new Error(
        'Injected shared executors require parent-retained artifact allocation through cleanup.'
      )
    if (
      maxWorkers !== 1 ||
      options.collectOnly ||
      options.coverage ||
      options.inspect ||
      (options.execute && !options.executeCohort) ||
      project.profile.environment !== 'node' ||
      project.profile.mode !== 'development' ||
      project.profile.route !== undefined ||
      project.setupFiles.length ||
      project.snapshotSerializers?.length ||
      project.globalSetup?.length ||
      project.bail ||
      project.executionEnvironment ||
      project.entries.some(
        (entry) =>
          entry.typecheck || entry.inSource || entry.executionEnvironment
      )
    )
      throw new Error(
        'isolate:false currently supports serial development Node cohorts without collection, coverage, debugging, setup, serializers, bail or type tests. Supervisors must own the aggregate worker.'
      )
  }
  const defaultSeed = Date.now()
  projects = projects.map((project) => {
    const sequence = {
      ...project.sequence,
      seed: project.sequence?.seed ?? defaultSeed,
    }
    return {
      ...project,
      sequence,
    }
  })
  const snapshotUpdateMode = resolveSnapshotUpdateMode(options)
  if (
    options.collectOnly &&
    (options.coverage || snapshotUpdateMode !== 'none')
  )
    throw new Error('Collection cannot request coverage or snapshot updates.')
  options = {
    ...options,
    snapshotUpdateMode,
    updateSnapshots: snapshotUpdateMode !== 'none',
  }
  if (options.coverage && snapshotUpdateMode === 'all') {
    throw new Error('Coverage cannot be combined with snapshot updates.')
  }
  if (
    projects.some(
      (project) => project.entries.length > 0 && project.browserFixtures?.length
    )
  ) {
    requireTestCapability('browserComponents')
  }
  if (options.coverage) {
    requireTestCapability('coverage')
    if (
      projects.some(
        (project) =>
          project.entries.length > 0 &&
          (project.profile.route !== undefined ||
            !(
              (project.profile.environment === 'node' &&
                !project.profile.browserClient) ||
              (project.profile.environment === 'browser' &&
                project.profile.browserClient === true &&
                project.profile.mode === 'development')
            ))
      )
    ) {
      throw new Error(
        'Coverage requires route-less Node or development Browser Mode client profiles.'
      )
    }
  }
  if (options.updateSnapshots) {
    requireTestCapability('snapshotUpdate')
    const selected = projects.filter((project) => project.entries.length > 0)
    const snapshotSources = selected.flatMap((project) =>
      project.entries.map((entry) => entry.file)
    )
    if (
      snapshotUpdateMode === 'all' &&
      new Set(snapshotSources).size !== snapshotSources.length
    ) {
      throw new Error(
        'Snapshot updates require a single selected profile per source file. Use --project to avoid conflicting snapshot writers.'
      )
    }
    if (
      selected.some((project) => project.profile.route !== undefined) &&
      (selected.some(
        (project) =>
          project.profile.route !== undefined &&
          project.profile.environment !== 'rsc'
      ) ||
        new Set(snapshotSources).size !== snapshotSources.length)
    ) {
      throw new Error(
        'Route snapshot updates require RSC profiles and a single selected profile per source file.'
      )
    }
  }
  const isolateProjects =
    options.isolateProjects &&
    !projects.some(
      (project) =>
        project.entries.length > 0 && project.profile.environment === 'browser'
    )
  const coverageModule =
    options.coverage && !options.standardCoverageOptions && !isolateProjects
      ? await import('./coverage/report.js')
      : undefined
  const coverageReport = coverageModule?.createCoverageReport(
    projects.flatMap((project) => project.entries.map((entry) => entry.id))
  )
  const runId = randomUUID()
  const started = performance.now()
  const controller = new AbortController()
  const cancel = () => controller.abort(options.signal.reason)
  if (options.signal.aborted) cancel()
  else options.signal.addEventListener('abort', cancel, { once: true })
  let reporterFailure: unknown
  let reporterFailed = false
  function failReporter(error: unknown) {
    reporterFailed = true
    reporterFailure ??= error
    controller.abort(error)
  }
  const reporter = createTestReporter({
    ...options.reporter,
    projectDir,
    fileCount: projects.reduce(
      (total, project) => total + project.entries.length,
      0
    ),
    write: options.write,
    onError(error) {
      failReporter(error)
      options.reporter?.onError?.(error)
    },
  })
  const collections: TestFileCollection[] = []
  let failed = false
  let unsafeCleanup = false
  const startedFiles = new Set<string>()
  const endedFiles = new Set<string>()
  const attemptsByFile = new Map<
    string,
    Extract<ResultEvent, { type: 'case-end' }>[]
  >()
  let failedCases = options.bailFailures ?? 0
  const bailReached = (project: DiscoveredTestProject) =>
    (project.bail ?? 0) > 0 && failedCases >= project.bail!
  const previousNodeEnv = process.env.NODE_ENV
  const envelope = () => ({
    version: 1 as const,
    runId,
    timestamp: Date.now(),
  })

  function onEvent(event: ResultEvent) {
    if (event.type === 'file-start') startedFiles.add(event.entry.id)
    if (event.type === 'case-end') {
      let attempts = attemptsByFile.get(event.entryId)
      if (!attempts) attemptsByFile.set(event.entryId, (attempts = []))
      attempts.push(event)
    }
    if (event.type === 'file-end' && !endedFiles.has(event.entryId)) {
      endedFiles.add(event.entryId)
      for (const test of getFinalCaseResults(
        attemptsByFile.get(event.entryId) ?? []
      ).values()) {
        if (test.status === 'failed') failedCases++
      }
      attemptsByFile.delete(event.entryId)
    }
    if (reporterFailed) return
    try {
      options.onEvent?.(event)
      reporter.onEvent(event)
    } catch (error) {
      // Stop producers but let their finally blocks close workers and leases.
      failReporter(error)
      try {
        reporter.dispose()
      } catch {
        // Keep the original failure if cursor restoration also fails.
      }
    }
  }

  function diagnostic(
    error: unknown,
    phase: SerializedDiagnostic['phase'],
    entry?: TestEntry
  ) {
    failed = true
    onEvent({
      ...envelope(),
      type: 'diagnostic',
      entryId: entry?.id,
      diagnostic: serializeDiagnostic(error, { phase }),
    })
  }

  function reportCompilationIssues(
    entry: TestEntry,
    artifact: CompiledTestArtifact
  ) {
    const hasErrors = artifact.diagnostics.some(
      (issue) => issue.severity === 'error'
    )
    if (hasErrors) failed = true
    for (const issue of artifact.diagnostics) {
      onEvent({
        ...envelope(),
        type: 'diagnostic',
        entryId: entry.id,
        revision: artifact.revision,
        diagnostic: issue,
      })
    }
    return hasErrors
  }

  function finishFailedFile(entry: TestEntry, fileStarted: number) {
    if (!startedFiles.has(entry.id)) {
      onEvent({ ...envelope(), type: 'file-start', entry })
    }
    if (!endedFiles.has(entry.id)) {
      onEvent({
        ...envelope(),
        type: 'file-end',
        entryId: entry.id,
        status: controller.signal.aborted ? 'cancelled' : 'failed',
        durationMs: performance.now() - fileStarted,
      })
    }
  }

  function isOnlyCancellation(error: unknown): boolean {
    if (!controller.signal.aborted) return false
    const pending = [error]
    const seen = new Set<object>()
    let inspected = 0
    try {
      while (pending.length) {
        if (++inspected > 128) return false
        const value = pending.pop()
        if (value === controller.signal.reason) continue
        if (
          !value ||
          (typeof value !== 'object' && typeof value !== 'function') ||
          seen.has(value)
        )
          return false
        seen.add(value)
        const causes: unknown = Reflect.get(value, 'errors')
        if (!Array.isArray(causes)) return false
        const length: unknown = Reflect.get(causes, 'length')
        if (
          typeof length !== 'number' ||
          !Number.isSafeInteger(length) ||
          length < 1 ||
          length > 128 - inspected - pending.length
        )
          return false
        for (let index = 0; index < length; index++) {
          pending.push(Reflect.get(causes, String(index)))
        }
      }
      return true
    } catch {
      // Thrown values may have hostile getters/proxies. Classification must not
      // replace the original failure or invoke user-provided array methods.
      return false
    }
  }

  async function executePrepared(
    { entry, artifact, started: fileStarted, coverageLease }: PreparedTest,
    project: DiscoveredTestProject
  ) {
    let serverModule: typeof import('./browser/server') | undefined
    let server: import('./browser/server').ApplicationServer | undefined
    let browserHost: import('./browser/host').BrowserHost | undefined
    let browser: import('./contracts').ExecuteTestOptions['browser']
    let stagedRuntimeConfiguration:
      | Awaited<ReturnType<typeof prepareRuntimeConfigurationReceipt>>
      | undefined
    let acquiringResource = false
    let executing = false
    const ownsFileEnd =
      project.profile.environment === 'browser' && !options.collectOnly
    const executionStarted = performance.now()
    let pendingFileEnd: Extract<ResultEvent, { type: 'file-end' }> | undefined
    let executionStatus:
      | import('./reporting/events').FileResult['status']
      | undefined
    let fileFailed = false
    let coverageReceived = false
    let customCoverageReceived = false
    let stagedSnapshotUpdates: SnapshotUpdate[] | undefined
    const executionEvent = (event: ResultEvent) => {
      if (!ownsFileEnd || event.type !== 'file-end') {
        onEvent(event)
        return
      }
      if (pendingFileEnd || event.entryId !== entry.id) {
        fileFailed = true
        diagnostic(
          new Error('Invalid browser worker file-end event.'),
          'runtime',
          entry
        )
        return
      }
      pendingFileEnd = event
    }
    const attachments = (
      items: import('./browser/server').ApplicationServerAttachment[]
    ) => {
      for (const attachment of items) {
        onEvent({
          ...envelope(),
          type: 'attachment',
          entryId: entry.id,
          revision: artifact.revision,
          attachment,
        })
      }
    }
    try {
      controller.signal.throwIfAborted()
      if (runtimeConfigurationPlan && (!options.execute || coverageLease))
        stagedRuntimeConfiguration = await prepareRuntimeConfigurationReceipt({
          artifact,
          plan: runtimeConfigurationPlan,
          artifactRoot: artifact.rootDir,
          signal: controller.signal,
        })
      if (options.coverage && !artifact.coverage) {
        throw new Error(
          'Coverage requires compiler-issued source metadata for the selected artifact.'
        )
      }
      if (
        project.profile.environment === 'browser' &&
        artifact.kind !== 'browser' &&
        !options.brokerOwnsBrowser &&
        !options.collectOnly
      ) {
        if (
          artifact.kind !== 'node' ||
          artifact.profile.environment !== 'browser' ||
          artifact.profile.mode !== project.profile.mode ||
          artifact.applicationServer?.mode !== project.profile.mode ||
          artifact.applicationServer.lockDistDir !== true ||
          (project.profile.mode === 'production' &&
            (!artifact.applicationServer.distDir ||
              !isAbsolute(artifact.applicationServer.distDir)))
        ) {
          throw new Error(
            'Browser tests require a matching Node driver artifact with resolved experimental.lockDistDir enabled.'
          )
        }
        // Retained for reported attachments, independently of compiler snapshots.
        const outputDir = await mkdtemp(
          join(tmpdir(), `next-test-browser-${runId}-`)
        )
        serverModule = await import('./browser/server.js')
        acquiringResource = true
        server = await serverModule.createApplicationServer({
          projectDir,
          mode: artifact.applicationServer.mode,
          outputLockEnabled: artifact.applicationServer.lockDistDir,
          distDir: artifact.applicationServer.distDir,
          browserFixtures: project.browserFixtures,
          outputDir,
          signal: controller.signal,
        })
        acquiringResource = false
        attachments(server.attachments)
        controller.signal.throwIfAborted()
        const { createBrowserHost } = await import('./browser/host.js')
        acquiringResource = true
        browserHost = await createBrowserHost({
          projectDir,
          signal: controller.signal,
        })
        acquiringResource = false
        controller.signal.throwIfAborted()
        browser = {
          wsEndpoint: browserHost.wsEndpoint,
          baseURL: server.baseURL,
          outputDir,
          ...(server.componentHost
            ? { componentHost: server.componentHost }
            : {}),
        }
      }
      const execute =
        options.execute ?? (await import('./execution/execute.js')).execute
      executing = true
      const result = await execute(artifact, {
        captureTaskResults: options.captureTaskResults,
        collectOnly: options.collectOnly,
        runId,
        projectDir,
        entry,
        setupFiles: project.setupFiles,
        snapshotSerializers: project.snapshotSerializers,
        updateSnapshots: options.updateSnapshots ?? false,
        snapshotUpdateMode,
        ...(project.profile.environment === 'browser' && options.updateSnapshots
          ? {
              onSnapshotUpdates: async (
                _file: string,
                updates: SnapshotUpdate[]
              ) => {
                if (stagedSnapshotUpdates)
                  throw new Error('Duplicate browser snapshot update plan.')
                stagedSnapshotUpdates = updates
              },
            }
          : {}),
        ...(options.customCoverageRequests?.[project.profile.id]
          ? {
              customCoverage:
                options.customCoverageRequests[project.profile.id],
              onCustomCoverage: async (
                completion: import('./coverage/custom-types').CustomCoverageCompletion
              ) => {
                assertCustomCoverageCompletion(
                  completion,
                  artifact,
                  runId,
                  options.customCoverageRequests![project.profile.id]
                )
                if (
                  customCoverageReceived ||
                  !completion.complete ||
                  completion.runId !== runId ||
                  completion.entryId !== entry.id ||
                  completion.revision !== artifact.revision
                )
                  throw new Error(
                    'Invalid or duplicate custom coverage completion.'
                  )
                customCoverageReceived = true
                customCoverage.push({
                  completion,
                  testFiles: [
                    relative(projectDir, entry.file).replaceAll('\\', '/'),
                  ],
                  environment: 'ssr',
                  ...(project.displayName === undefined
                    ? {}
                    : { projectName: project.displayName }),
                })
              },
            }
          : {}),
        ...(coverageReport || options.standardCoverageOptions
          ? {
              coverage: {
                version: 1 as const,
                kind: artifact.profile.browserClient
                  ? ('browser-v8' as const)
                  : ('node-line' as const),
              },
              onCoverage: async (
                completion: import('./contracts').TestCoverageCompletion
              ) => {
                if (
                  coverageReceived ||
                  completion.version !== 1 ||
                  completion.runId !== runId ||
                  completion.entryId !== entry.id ||
                  completion.revision !== artifact.revision
                ) {
                  throw new Error('Invalid or duplicate coverage completion.')
                }
                coverageReceived = true
                if (!completion.complete) {
                  coverageReport?.incomplete(entry.id, completion.error.message)
                  throw new Error('Coverage collection did not complete.')
                }
                let remapped
                if (options.standardCoverageOptions) {
                  const {
                    remapStandardCoverage,
                    remapPlannedStandardCoverage,
                  } = await import('./coverage/istanbul.js')
                  const { standardCoverageSourceSelector } = await import(
                    './coverage/options.js'
                  )
                  const selectSource = standardCoverageSourceSelector(
                    projectDir,
                    options.standardCoverageOptions
                  )
                  if (coverageLease) {
                    if (
                      !runtimeConfigurationPlan ||
                      !stagedRuntimeConfiguration
                    )
                      throw new Error(
                        'Planned JSX coverage requires current runtime configuration inputs'
                      )
                    const receipt = await stagedRuntimeConfiguration.seal()
                    stagedRuntimeConfiguration = undefined
                    runtimeConfigurationReceipts.push(receipt)
                    remapped = await remapPlannedStandardCoverage(
                      artifact,
                      completion,
                      {
                        runId,
                        entry,
                        sourcePlan: coverageSourcePlan,
                        runtimeConfigurationPlan,
                        runtimeConfigurationReceipt: receipt,
                        assertLease: coverageLease,
                      },
                      controller.signal,
                      selectSource
                    )
                  } else {
                    remapped = await remapStandardCoverage(
                      artifact,
                      completion.data,
                      selectSource
                    )
                  }
                  standardCoverage.push(remapped)
                } else {
                  const { remapCoverage } = await import('./coverage/remap.js')
                  remapped = await remapCoverage(artifact, completion.data)
                  coverageReport!.add(remapped)
                }
                if (!remapped.complete || remapped.errors.length > 0) {
                  throw new Error('Coverage remapping did not complete.')
                }
              },
            }
          : {}),
        ...(project.tags === undefined ? {} : { tags: project.tags }),
        ...(project.strictTags === undefined
          ? {}
          : { strictTags: project.strictTags }),
        ...(project.attachmentsDir === undefined
          ? {}
          : { attachmentsDir: project.attachmentsDir }),
        globals: project.globals,
        fakeTimers: project.fakeTimers,
        clearMocks: project.clearMocks,
        mockReset: project.mockReset,
        restoreMocks: project.restoreMocks,
        unstubGlobals: project.unstubGlobals,
        unstubEnvs: project.unstubEnvs,
        sequence: project.sequence,
        maxConcurrency: project.maxConcurrency,
        retry: project.retry,
        bail: project.bail ? Math.max(1, project.bail - failedCases) : 0,
        allowOnly: project.allowOnly ?? !process.env.CI,
        passWithNoTests: project.passWithNoTests,
        provide: project.provide,
        env: project.env,
        browserViewport: project.browserViewport,
        testTimeout: project.testTimeout,
        hookTimeout: project.hookTimeout,
        testNamePattern: options.testNamePattern ?? project.testNamePattern,
        inspect: options.inspect,
        inspectBrk: options.inspectBrk,
        fileTimeout: project.fileTimeout,
        signal: controller.signal,
        onEvent: executionEvent,
        ...(browser ? { browser } : {}),
      })
      executing = false
      if (
        (coverageReport || options.standardCoverageOptions) &&
        !coverageReceived &&
        !controller.signal.aborted
      ) {
        throw new Error('Worker completed without coverage collection.')
      }
      if (
        options.customCoverageRequests?.[project.profile.id] &&
        !customCoverageReceived &&
        !controller.signal.aborted
      )
        throw new Error('Worker completed without custom coverage collection.')
      if (options.collectOnly && result.status === 'passed') {
        if (!result.collection)
          throw new Error('Worker completed without collection facts.')
        collections.push(result.collection)
      }
      executionStatus = result.status
      if (ownsFileEnd && !pendingFileEnd && result.status !== 'cancelled') {
        throw new Error('Browser worker completed without a file-end event.')
      }
      if (result.status === 'failed' || pendingFileEnd?.status === 'failed') {
        fileFailed = true
      }
      if (result.status === 'failed') failed = true
    } catch (error) {
      if (
        serverModule &&
        error instanceof serverModule.ApplicationServerError
      ) {
        attachments(error.attachments)
      }
      coverageReport?.incomplete(
        entry.id,
        'Execution or coverage processing failed.'
      )
      if (!isOnlyCancellation(error)) {
        fileFailed = true
        diagnostic(error, 'runtime', entry)
      }
      if (!ownsFileEnd) finishFailedFile(entry, fileStarted)
      // A failed acquisition may include failed cleanup without returning a
      // lease to dispose. Conservatively stop rather than acquire another owner.
      if (acquiringResource || executing) {
        unsafeCleanup = true
        controller.abort(error)
      }
    } finally {
      // Acquisition signals do not dispose leases. B must close first, including
      // after cancellation or a hard kill, so its own teardown can still run.
      for (const resource of [browserHost, server]) {
        try {
          await resource?.dispose()
        } catch (error) {
          fileFailed = true
          unsafeCleanup = true
          diagnostic(error, 'cleanup', entry)
          // Failed parent disposal may leave an output owner alive. Do not
          // acquire another server or resume compilation in this run.
          controller.abort(error)
        }
      }
      if (
        stagedSnapshotUpdates &&
        !fileFailed &&
        executionStatus === 'passed' &&
        !controller.signal.aborted
      ) {
        try {
          if (artifact.kind === 'browser') {
            const { createClientSnapshotAccess } = await import(
              './client/snapshot-access.js'
            )
            await (
              await createClientSnapshotAccess(
                artifact.client.sourceFile,
                artifact.sourceHash
              )
            ).verify()
          }
          await commitSnapshotUpdates(entry.file, stagedSnapshotUpdates, {
            projectDir,
            signal: controller.signal,
            sourceHash: artifact.sourceHash,
          })
        } catch (error) {
          fileFailed = true
          failed = true
          diagnostic(error, 'cleanup', entry)
        }
      }
      if (
        stagedRuntimeConfiguration &&
        !controller.signal.aborted &&
        !unsafeCleanup
      ) {
        try {
          runtimeConfigurationReceipts.push(
            await stagedRuntimeConfiguration.seal()
          )
        } catch (error) {
          fileFailed = true
          failed = true
          diagnostic(error, 'cleanup', entry)
        }
      }
      if (ownsFileEnd) {
        if (!startedFiles.has(entry.id)) {
          onEvent({ ...envelope(), type: 'file-start', entry })
        }
        onEvent({
          ...envelope(),
          type: 'file-end',
          entryId: entry.id,
          status:
            fileFailed || pendingFileEnd?.status === 'failed'
              ? 'failed'
              : controller.signal.aborted
                ? 'cancelled'
                : (executionStatus ?? pendingFileEnd?.status ?? 'failed'),
          durationMs: performance.now() - executionStarted,
        })
      }
    }
  }

  async function runIsolatedProject(group: DiscoveredTestProject[]) {
    const selected = new Set(
      group.flatMap((project) => project.entries.map((entry) => entry.id))
    )
    const collectionRevisions = new Map<string, string>()
    const { runWatchProcess, WatchOwnershipError } = await import(
      './watch-process.js'
    )
    try {
      const completion = await runWatchProcess(
        {
          operation: 'run',
          captureTaskResults: options.captureTaskResults,
          projectDir,
          projects: group,
          ...(options.compilerTransforms
            ? { compilerTransforms: options.compilerTransforms }
            : {}),
          maxWorkers,
          isolatedProfile: true,
          collectOnly: options.collectOnly,
          inspect: options.inspect,
          inspectBrk: options.inspectBrk,
          updateSnapshots: options.updateSnapshots,
          snapshotUpdateMode,
          coverage: options.coverage,
          standardCoverageOptions: options.standardCoverageOptions,
          ...(options.standardCoverageOptions
            ? {
                runtimeConfigurationPlan: {
                  ...runtimeConfigurationPlan!,
                  requests: runtimeConfigurationPlan!.requests.filter(
                    (request) =>
                      group.some(
                        (project) => project.profile.id === request.profile.id
                      )
                  ),
                },
                coverageSourcePlan: {
                  ...coverageSourcePlan,
                  requests: coverageSourcePlan.requests.filter((request) =>
                    group.some(
                      (project) => project.profile.id === request.profile.id
                    )
                  ),
                },
              }
            : {}),
          ...(options.customCoverageRequests
            ? {
                customCoverageRequests: Object.fromEntries(
                  group
                    .filter((project) => project.customCoverage)
                    .map((project) => [
                      project.profile.id,
                      options.customCoverageRequests![project.profile.id],
                    ])
                ),
              }
            : {}),
          testNamePattern: options.testNamePattern,
          passWithNoTests: options.passWithNoTests,
          bailFailures: failedCases,
        },
        {
          signal: controller.signal,
          write: options.write,
          writeError: options.reporter?.writeError,
          report: false,
          onEvent(event) {
            if (
              event.type === 'file-start' &&
              typeof event.revision === 'string'
            )
              collectionRevisions.set(event.entry.id, event.revision)
            if (event.type === 'run-start' || event.type === 'run-end') return
            onEvent({ ...event, runId })
          },
        }
      )
      if (completion.operation !== 'run')
        throw new Error('Invalid isolated project result.')
      if (completion.result.collections !== undefined) {
        if (!options.collectOnly)
          throw new Error(
            'Isolated project returned unsolicited collection facts.'
          )
        assertTestFileCollections(
          completion.result.collections,
          selected,
          collectionRevisions,
          completion.result.status === 'passed'
        )
      }
      if (options.customCoverageRequests) {
        if (completion.result.unsafeCleanup)
          throw new Error('Custom coverage generation cleanup failed.')
        customCoverage.push(
          ...assertCustomCoverageFacts(
            completion.result.customCoverage,
            projectDir,
            group,
            options.customCoverageRequests,
            collectionRevisions
          )
        )
      } else if (completion.result.customCoverage !== undefined)
        throw new Error('Unrequested custom coverage facts.')
      if (options.standardCoverageOptions) {
        const { assertStandardCoverageFacts } = await import(
          './coverage/report-standard.js'
        )
        standardCoverage.push(
          ...(await assertStandardCoverageFacts(
            completion.result.standardCoverage,
            projectDir,
            selected,
            collectionRevisions,
            runtimeConfigurationPlan
              ? { sourcePlan: coverageSourcePlan, runtimeConfigurationPlan }
              : undefined,
            controller.signal
          ))
        )
        if (!Array.isArray(completion.result.compilerSourceCoverage))
          throw new Error(
            'Isolated project omitted parent compiler source analyses'
          )
        compilerSourceCoverage.push(...completion.result.compilerSourceCoverage)
        if (!Array.isArray(completion.result.runtimeConfigurationReceipts))
          throw new Error(
            'Isolated project omitted parent runtime config receipts'
          )
        runtimeConfigurationReceipts.push(
          ...completion.result.runtimeConfigurationReceipts
        )
      } else if (completion.result.standardCoverage !== undefined) {
        throw new Error('Unrequested standard coverage facts.')
      }
      if (completion.result.status !== 'passed') failed = true
      else if (options.collectOnly) {
        if (!completion.result.collections)
          throw new Error('Missing isolated collection facts.')
        collections.push(...completion.result.collections)
      }
      if (completion.result.unsafeCleanup) {
        unsafeCleanup = true
        controller.abort(new Error('Isolated project cleanup failed.'))
      }
    } catch (error) {
      if (!isOnlyCancellation(error)) diagnostic(error, 'runtime')
      if (error instanceof WatchOwnershipError) {
        unsafeCleanup = true
        controller.abort(error)
      }
    }
  }

  try {
    onEvent({
      ...envelope(),
      type: 'run-start',
      snapshotUpdateMode,
      specificationOrder: [
        ...(options.specificationOrder ??
          projects.flatMap((project) =>
            project.entries.map((entry) => entry.id)
          )),
      ],
    })
    const selected = projects.filter(
      (project) =>
        project.entries.length > 0 ||
        coverageSourcePlan.requests.some(
          (request) => request.profile.id === project.profile.id
        )
    )
    const modes = new Set(selected.map((project) => project.profile.mode))
    if (
      !projects.some((project) => project.entries.length) &&
      !options.passWithNoTests
    )
      diagnostic(new Error('No test files selected.'), 'configuration')
    if (!selected.length) {
      // Successful empty selection still emits a complete machine report.
    } else if (
      modes.size === 1 &&
      previousNodeEnv &&
      previousNodeEnv !== selected[0].profile.mode
    ) {
      diagnostic(
        new Error(
          `Selected test projects require NODE_ENV=${selected[0].profile.mode}; the current NODE_ENV conflicts with their Next compilation profile.`
        ),
        'configuration'
      )
    } else if (modes.size !== 1 || isolateProjects) {
      if (
        selected.some((project) => project.profile.environment === 'browser') ||
        options.execute ||
        options.allocateArtifact
      ) {
        diagnostic(
          new Error(
            'Mixed compilation modes support one-shot Node/RSC projects only; browser and nested orchestration are unsupported. Use --project.'
          ),
          'configuration'
        )
      } else {
        // Fresh config/env/module caches for each mode. Configured output
        // directories can overlap, so await full generation disposal in order.
        const groups =
          modes.size === 1 ? [selected] : selected.map((project) => [project])
        for (const group of groups) {
          if (controller.signal.aborted) break
          if (
            group.every(bailReached) &&
            !coverageSourcePlan.requests.some((request) =>
              group.some((project) => project.profile.id === request.profile.id)
            )
          )
            break
          await runIsolatedProject(group)
        }
      }
    } else {
      const mode = selected[0].profile.mode
      if (previousNodeEnv && previousNodeEnv !== mode) {
        diagnostic(
          new Error(
            `Selected test projects require NODE_ENV=${mode}; the current NODE_ENV conflicts with their Next compilation profile.`
          ),
          'configuration'
        )
      } else {
        // Set before importing compiler setup or loading Next's environment files.
        ;(process.env as any).NODE_ENV = mode
        for (const project of selected) {
          if (controller.signal.aborted) break
          if (
            bailReached(project) &&
            !coverageSourcePlan.requests.some(
              (request) => request.profile.id === project.profile.id
            )
          )
            continue
          if (
            (options.isolateProjects ||
              (project.isolate === false && !options.executeCohort)) &&
            project.profile.environment !== 'browser'
          ) {
            await runIsolatedProject([project])
            continue
          }
          const typeEntries = project.entries.filter((entry) => entry.typecheck)
          if (typeEntries.length) {
            try {
              const { runTypecheckProject } = await import('./typecheck.js')
              const completion = await runTypecheckProject(
                projectDir,
                project,
                {
                  signal: controller.signal,
                  testNamePattern:
                    options.testNamePattern ?? project.testNamePattern,
                }
              )
              for (const error of completion.sourceErrors) {
                failed = true
                onEvent({
                  ...envelope(),
                  type: 'diagnostic',
                  diagnostic: error,
                })
              }
              for (const file of completion.files) {
                const entry = typeEntries.find(
                  (item) => item.id === file.entryId
                )!
                onEvent({
                  ...envelope(),
                  type: 'file-start',
                  entry,
                  revision: file.revision,
                })
                for (const test of file.cases) {
                  onEvent({ ...envelope(), type: 'case-end', ...test })
                }
                for (const suite of file.suites) {
                  onEvent({
                    ...envelope(),
                    type: 'suite-end',
                    ...suite,
                    revision: file.revision,
                  })
                }
                for (const error of file.errors) {
                  onEvent({
                    ...envelope(),
                    type: 'diagnostic',
                    entryId: entry.id,
                    revision: file.revision,
                    diagnostic: error,
                  })
                }
                onEvent({
                  ...envelope(),
                  type: 'file-end',
                  entryId: entry.id,
                  status: file.status,
                  durationMs: file.durationMs,
                })
                if (file.status !== 'passed') failed = true
              }
            } catch (error) {
              for (const entry of typeEntries) {
                if (!isOnlyCancellation(error))
                  diagnostic(error, 'compilation', entry)
                finishFailedFile(entry, started)
              }
            }
          }
          const runtimeEntries = project.entries.filter(
            (entry) => !entry.typecheck
          )
          const sourceRequests = coverageSourcePlan.requests.filter(
            (request) => request.profile.id === project.profile.id
          )
          if (
            (!runtimeEntries.length && !sourceRequests.length) ||
            controller.signal.aborted
          )
            continue
          let session:
            | Awaited<
                ReturnType<
                  typeof import('./compiler').createTestCompilerSession
                >
              >
            | undefined
          let projectPhase: SerializedDiagnostic['phase'] = 'compilation'
          let sessionClosed = false
          const plannedJsx =
            project.profile.environment === 'node' &&
            sourceRequests.some((request) =>
              /\.[jt]sx$/.test(request.source.file)
            )
          const plannedTypeScriptImports =
            options.nodeTypeScriptImportCoverage === true &&
            project.isolate !== false &&
            project.profile.environment === 'node' &&
            project.profile.runtime === 'nodejs' &&
            ['development', 'production'].includes(project.profile.mode) &&
            !project.profile.browserClient &&
            project.profile.route === undefined &&
            sourceRequests.some(
              (request) =>
                isDeepStrictEqual(request.profile, project.profile) &&
                /\.[cm]?ts$/.test(request.source.file) &&
                !/\.d\.[cm]?ts$/.test(request.source.file)
            )
          try {
            const { createTestCompilerSession } = await import(
              './compiler/index.js'
            )
            session = await createTestCompilerSession(
              projectDir,
              project.profile,
              {
                allocateArtifact: options.allocateArtifact,
                ...(plannedJsx || plannedTypeScriptImports
                  ? { nativeImportCoverageRoles: true }
                  : {}),
                ...(project.compilerAliases
                  ? { compilerAliases: project.compilerAliases }
                  : {}),
                ...(options.compilerTransforms?.[project.profile.id]
                  ? {
                      compilerTransforms:
                        options.compilerTransforms[project.profile.id],
                    }
                  : {}),
              }
            )
            const compilerSession = session
            const assertCoverageLease = () => {
              controller.signal.throwIfAborted()
              if (sessionClosed || session !== compilerSession)
                throw new Error('Planned JSX coverage artifact lease closed')
            }
            for (const request of sourceRequests) {
              const compiled = await compilerSession.compileCoverageSource(
                request.source,
                {
                  signal: controller.signal,
                  revision: request.revision,
                  configurationImports: request.configurationImports,
                }
              )
              if (options.onCoverageSource)
                await options.onCoverageSource(compiled, controller.signal)
              else {
                if (options.execute)
                  throw new Error(
                    'Compiler source analysis requires a parent broker consumer'
                  )
                compilerSourceCoverage.push(
                  await analyzeCompiledCoverageSource(
                    compiled,
                    {
                      projectDir,
                      artifactRoot: compiled.artifact.rootDir,
                      profile: request.profile,
                      source: request.source,
                      revision: request.revision,
                      configurationImports: request.configurationImports,
                      ...(plannedJsx || plannedTypeScriptImports
                        ? {
                            nativeImportCoverageRoles: {
                              version: 1 as const,
                              assertLease: assertCoverageLease,
                            },
                          }
                        : {}),
                    },
                    controller.signal
                  )
                )
              }
            }
            if (project.isolate === false && runtimeEntries.length) {
              const ordered = shuffleFiles(project.sequence?.shuffle)
                ? shuffle(
                    [...runtimeEntries],
                    project.sequence?.seed ?? defaultSeed
                  )
                : runtimeEntries
              const cohort = await compilerSession.compileCohort(ordered, {
                signal: controller.signal,
              })
              let compilationFailed = false
              for (const [index, artifact] of cohort.artifacts.entries())
                compilationFailed =
                  reportCompilationIssues(ordered[index], artifact) ||
                  compilationFailed
              if (compilationFailed) {
                for (const entry of ordered) finishFailedFile(entry, started)
                continue
              }
              projectPhase = 'runtime'
              const executeCohort = options.executeCohort
              if (!executeCohort)
                throw new Error(
                  'Shared cohorts require a parent-owned execution broker.'
                )
              let results: readonly import('./contracts').TestExecutionResult[]
              try {
                results = await executeCohort(
                  cohort,
                  ordered.map((entry) => ({
                    captureTaskResults: options.captureTaskResults,
                    runId,
                    projectDir,
                    entry,
                    setupFiles: [],
                    updateSnapshots: options.updateSnapshots ?? false,
                    snapshotUpdateMode,
                    tags: project.tags,
                    strictTags: project.strictTags,
                    attachmentsDir: project.attachmentsDir,
                    globals: project.globals,
                    fakeTimers: project.fakeTimers,
                    clearMocks: project.clearMocks,
                    mockReset: project.mockReset,
                    restoreMocks: project.restoreMocks,
                    unstubGlobals: project.unstubGlobals,
                    unstubEnvs: project.unstubEnvs,
                    sequence: project.sequence,
                    maxConcurrency: project.maxConcurrency,
                    retry: project.retry,
                    allowOnly: project.allowOnly ?? !process.env.CI,
                    passWithNoTests: project.passWithNoTests,
                    provide: project.provide,
                    env: project.env,
                    browserViewport: project.browserViewport,
                    testTimeout: project.testTimeout,
                    hookTimeout: project.hookTimeout,
                    fileTimeout: project.fileTimeout,
                    testNamePattern:
                      options.testNamePattern ?? project.testNamePattern,
                    signal: controller.signal,
                    onEvent,
                  }))
                )
              } catch (error) {
                // A rejected aggregate may represent a process/group/cache disposal failure.
                // Keep the compiler/artifact lease until the producer has settled, then
                // retire this run rather than certifying uncertain ownership.
                const { isCohortExecutionClosedError } = await import(
                  './execution/execute-cohort.js'
                )
                if (!isCohortExecutionClosedError(error)) {
                  unsafeCleanup = true
                  controller.abort(error)
                }
                throw error
              }
              if (
                results.length !== ordered.length ||
                results.some(
                  (result, index) =>
                    result.entryId !== ordered[index].id ||
                    !['passed', 'failed', 'cancelled'].includes(result.status)
                )
              )
                throw new Error(
                  'Shared worker returned incomplete or foreign file results.'
                )
              if (results.some((result) => result.status !== 'passed'))
                failed = true
              continue
            }
            const browserTests: PreparedTest[] = []
            await forEachTestFile(
              shuffleFiles(project.sequence?.shuffle)
                ? shuffle(
                    [...runtimeEntries],
                    project.sequence?.seed ?? defaultSeed
                  )
                : runtimeEntries,
              project.profile.environment === 'browser' ? 1 : maxWorkers,
              controller.signal,
              async (entry) => {
                if (bailReached(project)) return
                const fileStarted = performance.now()
                try {
                  const runtimeRequest =
                    runtimeConfigurationPlan?.requests.find(
                      (request) => request.profile.id === project.profile.id
                    )
                  const runtimeEntry = runtimeRequest?.entries.find(
                    (candidate) => candidate.id === entry.id
                  )
                  if (
                    runtimeConfigurationPlan &&
                    (!runtimeRequest || !runtimeEntry)
                  )
                    throw new Error(
                      'Missing parent runtime config request for selected entry'
                    )
                  const artifact = await compilerSession.compile(entry, {
                    ...(runtimeRequest && runtimeEntry
                      ? {
                          runtimeConfigurationImports: {
                            authorization: runtimeRequest.authorization,
                            entry: runtimeEntry,
                          },
                        }
                      : {}),
                    signal: controller.signal,
                    setupFiles: project.setupFiles,
                    setupFilesSequence: project.sequence?.setupFiles ?? 'list',
                    snapshotSerializers: project.snapshotSerializers,
                    ...(options.coverage
                      ? {
                          coverage: {
                            version: 1 as const,
                            kind: project.profile.browserClient
                              ? ('browser-v8' as const)
                              : ('node-line' as const),
                          },
                        }
                      : {}),
                  })
                  if (reportCompilationIssues(entry, artifact)) {
                    finishFailedFile(entry, fileStarted)
                    return
                  }
                  controller.signal.throwIfAborted()
                  const prepared = {
                    entry,
                    artifact,
                    started: fileStarted,
                    ...(plannedJsx || plannedTypeScriptImports
                      ? { coverageLease: assertCoverageLease }
                      : {}),
                  }
                  if (
                    project.profile.environment === 'browser' &&
                    !options.collectOnly
                  ) {
                    browserTests.push(prepared)
                  } else {
                    await executePrepared(prepared, project)
                  }
                } catch (error) {
                  if (!isOnlyCancellation(error))
                    diagnostic(error, 'compilation', entry)
                  finishFailedFile(entry, fileStarted)
                }
              }
            )
            if (browserTests.length && !controller.signal.aborted) {
              projectPhase = 'cleanup'
              // Release actual native output/cache ownership before Next's
              // normal app server takes its output lock. Keep snapshots leased.
              await session.shutdownCompilation()
              for (const prepared of browserTests) {
                if (controller.signal.aborted) break
                if (bailReached(project)) break
                await executePrepared(prepared, project)
              }
            }
          } catch (error) {
            if (!isOnlyCancellation(error)) {
              if (!project.entries.length) diagnostic(error, projectPhase)
              for (const entry of project.entries) {
                if (endedFiles.has(entry.id)) continue
                diagnostic(error, projectPhase, entry)
                finishFailedFile(entry, started)
              }
            }
          } finally {
            // B.execute resolves only after bounded child closure, including
            // cancellation. Keep the snapshot lease alive until that point.
            try {
              sessionClosed = true
              await session?.dispose()
            } catch (error) {
              unsafeCleanup = true
              diagnostic(error, 'cleanup')
              controller.abort(error)
            }
          }
        }
      }
    }
  } finally {
    if (
      options.standardCoverageOptions &&
      !options.onCoverageSource &&
      !controller.signal.aborted &&
      !unsafeCleanup
    ) {
      try {
        if (runtimeConfigurationPlan && !options.execute)
          await assertRuntimeConfigurationReceipts({
            receipts: runtimeConfigurationReceipts,
            facts: standardCoverage,
            plan: runtimeConfigurationPlan,
            signal: controller.signal,
          })
        await assertCompilerSourceCoverage(
          compilerSourceCoverage,
          coverageSourcePlan,
          controller.signal
        )
      } catch (error) {
        if (!isOnlyCancellation(error)) diagnostic(error, 'reporter')
      }
    }
    if (controller.signal.aborted) {
      for (const project of projects) {
        for (const entry of project.entries) {
          if (!endedFiles.has(entry.id)) finishFailedFile(entry, started)
        }
      }
    }
    if (coverageReport && coverageModule) {
      try {
        if (controller.signal.aborted || unsafeCleanup || reporterFailed) {
          coverageReport.incomplete(
            'run',
            'Coverage run was interrupted or cleanup failed.'
          )
        }
        const report = coverageReport.finish()
        if (!report.complete && !controller.signal.aborted)
          diagnostic(new Error('Coverage report is incomplete.'), 'reporter')
        const output = await coverageModule.writeCoverageReport(
          report,
          tmpdir(),
          controller.signal
        )
        onEvent({
          ...envelope(),
          type: 'output',
          stream: 'stdout',
          text: output.text,
        })
        for (const [name, path, contentType] of [
          ['coverage.json', output.jsonPath, 'application/json'],
          ['coverage.txt', output.textPath, 'text/plain'],
        ]) {
          onEvent({
            ...envelope(),
            type: 'attachment',
            attachment: { name, path, contentType, kind: 'file' },
          })
        }
      } catch (error) {
        if (!isOnlyCancellation(error)) diagnostic(error, 'reporter')
      }
    }
    options.signal.removeEventListener('abort', cancel)
    if (previousNodeEnv === undefined) delete (process.env as any).NODE_ENV
    else (process.env as any).NODE_ENV = previousNodeEnv
    onEvent({
      ...envelope(),
      type: 'run-end',
      status: failed
        ? 'failed'
        : controller.signal.aborted
          ? 'cancelled'
          : 'passed',
      durationMs: performance.now() - started,
    })
    try {
      reporter.dispose()
    } catch (error) {
      failReporter(error)
    }
  }
  if (reporterFailed) throw reporterFailure
  return {
    ...reporter.getSummary(),
    unsafeCleanup,
    ...(options.collectOnly ? { collections } : {}),
    ...(options.standardCoverageOptions ? { standardCoverage } : {}),
    ...(options.standardCoverageOptions && !options.onCoverageSource
      ? {
          compilerSourceCoverage,
          coverageSourcePlan,
          runtimeConfigurationPlan,
          runtimeConfigurationReceipts,
        }
      : {}),
    ...(options.customCoverageRequests ? { customCoverage } : {}),
  }
}
