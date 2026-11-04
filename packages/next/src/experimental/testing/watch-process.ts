import {
  assertSnapshotPreparationFailure,
  type SnapshotPreparationFailure,
} from './execution/snapshot-preparation'
import type { RuntimeModuleCompletion } from './execution/completed-module'
import { isSharedRscWatchRun } from './incremental/shared-rsc-cohort'
import type {
  IstanbulSourcePlan,
  IstanbulSourceDeclarations,
} from './coverage/istanbul-types'
import { isDeepStrictEqual } from 'util'
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
import type { BrowserApplicationOwnership } from './execution/broker'
import type {
  CustomCoverageRequest,
  CustomCoverageFact,
} from './coverage/custom-types'
import { assertCustomCoverageFacts } from './coverage/custom-facts'
import { fork, execFile } from 'child_process'
import type {
  StandardCoverageOptions,
  CompilerSourceCoverage,
} from './coverage/types'
import { promisify } from 'node:util'
import { drainConsoleCallbacks } from './execution/console-drain'
import { createTestRecordReceipts } from './execution/test-record-forwarding'
import { randomUUID } from 'crypto'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { join, relative, isAbsolute, resolve as resolvePath } from 'path'
import type { DiscoveredTestProject } from './discovery'
import type { TestEntry, TestProfile, TestRecordEvent } from './contracts'
import type { TestArtifact } from './runner/tasks'
import type { WatchDirectories } from './incremental/watch-files'
import type { runTests } from './orchestrator'
import type { ResultEvent, SerializedDiagnostic } from './reporting/events'
import {
  createTestReporter,
  type TestReporterOptions,
} from './reporting/reporter'
import { serializeDiagnostic } from './reporting/diagnostics'
import { assertTestFileCollections } from './execution/collection'
import {
  commitSnapshotUpdates,
  combineSnapshotUpdatePlans,
  resolveSnapshotUpdateMode,
  type SnapshotUpdate,
  type SnapshotUpdateMode,
} from './assertions/snapshots'

export type WatchProcessRequest =
  | {
      operation: 'plan'
      projectDir: string
      projects: DiscoveredTestProject[]
      certifiedTestConfig: boolean
      /** Only the parent's fulfilled, retained global setup watch owner. */
      retainedGlobalSetup?: boolean
    }
  | { operation: 'metadata'; projectDir: string; profiles: TestProfile[] }
  | {
      operation: 'run'
      captureJUnitSuiteTasks?: true
      /** Exact positive request from the actual isolated one-shot V8 owner. */
      captureOneShotV8CollectionRestoration?: true
      preparePublicSnapshots?: true
      /** Actual one-shot read-only V8 snapshot completion owner. */
      captureOneShotV8ReadOnlySnapshots?: true
      /** Private actual scheduler occurrence; no authored callback acknowledgement. */
      captureModuleQueued?: true
      captureTaskResults?: boolean
      /** Positive actual one-shot parent record callback capture. */
      captureTestRecords?: true
      captureModuleCollected?: true
      /** Actual prepared root pack; requires the positive one-shot snapshot owner. */
      captureModuleStart?: true
      /** Actual logical case preparation, requested by its parent reporter. */
      captureCaseReady?: true
      compilerTransforms?: Record<
        string,
        import('./compiler/transform-broker').CompilerTransformDescriptor
      >
      collectOnly?: boolean
      inspect?: string
      inspectBrk?: boolean
      projectDir: string
      projects: DiscoveredTestProject[]
      testNamePattern?: string | RegExp
      passWithNoTests?: boolean
      bailFailures?: number
      updateSnapshots?: boolean
      snapshotUpdateMode?: SnapshotUpdateMode
      snapshotFormat?: import('./snapshot-format').SnapshotFormat
      maxWorkers?: number
      coverage?: boolean
      standardCoverageOptions?: StandardCoverageOptions
      istanbulSourcePlan?: IstanbulSourcePlan
      /** Issued by an outer parent profile coordinator or this process before fork. */
      coverageSourcePlan?: CoverageSourcePlan
      runtimeConfigurationPlan?: RuntimeConfigurationPlan
      coverageInputs?: readonly string[]
      includeUnimportedCoverage?: boolean
      customCoverageRequests?: Record<string, CustomCoverageRequest>
      customCoverageDisabled?: true
      /** One-shot mixed-profile orchestration; never inherit another mode. */
      isolatedProfile?: boolean
      /** Explicit standard watch generation; parent owns retained facts/publication. */
      watchCoverage?: boolean
      /** Private scheduling request; only the outer host owns the user signal. */
      userCancellation?: true
    }

export type WatchProcessResult =
  | {
      operation: 'plan'
      plan: import('./incremental/source-selection').SourceSelectionPlan
    }
  | { operation: 'metadata'; directories: WatchDirectories }
  | {
      operation: 'run'
      result: Awaited<ReturnType<typeof runTests>>
      /** Issued only by this parent after every actual worker/compiler owner closes. */
      orderlyCancellation?: {
        launchedEntryIds: string[]
        notExecutedEntryIds: string[]
      }
      /** Parent-sealed failed compilation; no partial coverage can publish. */ standardCoverageUnavailable?: true
    }

export type WatchProcessMessage =
  | { type: 'console-drain-forwarded'; id: string }
  | {
      type: 'snapshot-preparation-failure'
      failure: SnapshotPreparationFailure
    }
  | { type: 'result'; value: WatchProcessResult }
  | { type: 'error'; message: string; queueFailure?: SerializedDiagnostic }
  | { type: 'event'; event: ResultEvent; recordId?: string }
  | { type: 'module-queued'; entryId: string }

/** Private queue-transport failures retain actual ordered execution/write errors. */
export function readQueuedModuleFailure(payload: unknown): Error {
  let remaining = 20_000
  function read(value: unknown, depth: number): Error {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      depth > 10 ||
      --remaining < 0
    )
      throw new Error('Invalid queued module transport failure.')
    const diagnostic = value as Record<string, unknown>
    if (
      diagnostic.phase !== 'runtime' ||
      diagnostic.severity !== 'error' ||
      typeof diagnostic.message !== 'string' ||
      Object.keys(diagnostic).some(
        (key) =>
          ![
            'phase',
            'severity',
            'message',
            'name',
            'stack',
            'diff',
            'cause',
            'errors',
          ].includes(key)
      ) ||
      ['name', 'stack', 'diff'].some(
        (key) =>
          diagnostic[key] !== undefined && typeof diagnostic[key] !== 'string'
      ) ||
      (diagnostic.errors !== undefined && !Array.isArray(diagnostic.errors))
    )
      throw new Error('Invalid queued module transport failure.')
    const options =
      diagnostic.cause === undefined
        ? undefined
        : { cause: read(diagnostic.cause, depth + 1) }
    const error = Array.isArray(diagnostic.errors)
      ? new AggregateError(
          diagnostic.errors.map((nested) => read(nested, depth + 1)),
          diagnostic.message,
          options
        )
      : new Error(diagnostic.message, options)
    // Primitive rejection diagnostics do not own an Error name or stack.
    // Shadow the constructor defaults rather than inventing parent frames.
    Object.defineProperties(error, {
      name: { value: diagnostic.name, writable: true, configurable: true },
      stack: { value: diagnostic.stack, writable: true, configurable: true },
    })
    if (typeof diagnostic.diff === 'string')
      Object.defineProperty(error, 'diff', {
        value: diagnostic.diff,
        enumerable: true,
      })
    return error
  }
  const error = read(payload, 0)
  if (!(error instanceof AggregateError) || !error.errors.length)
    throw new Error('Invalid queued module transport failure.')
  return error
}

export interface ArtifactAllocationRequest {
  type: 'artifact-allocation-request'
  id: string
  parentDir: string
}

export interface ArtifactAllocationResponse {
  type: 'artifact-allocation-response'
  id: string
  allocation?: { stagingDir: string; rootDir: string }
  error?: string
}

/** A failed ownership check must never be treated as recoverable configuration. */
export class WatchOwnershipError extends Error {
  constructor(cause: unknown) {
    super(
      'Watch generation cleanup failed; output ownership cannot be reused.',
      { cause }
    )
    this.name = 'WatchOwnershipError'
  }
}

const execFileAsync = promisify(execFile)

/** Confirm an ambiguous kernel probe against process membership, never permissions. */
async function generationGroupHasMembers(pid: number): Promise<boolean> {
  const { stdout } = await execFileAsync('ps', ['-axo', 'pgid=,pid='], {
    timeout: 1000,
    maxBuffer: 8 * 1024 * 1024,
  })
  let found = false
  for (const line of stdout.trim().split('\n')) {
    const fields = /^\s*(\d+)\s+(\d+)\s*$/.exec(line)
    if (!fields)
      throw new Error('Cannot verify watch process group membership.')
    if (Number(fields[1]) === pid) found = true
  }
  return found
}

export async function closeGenerationGroup(pid: number) {
  const signal = async (value: NodeJS.Signals | 0) => {
    try {
      process.kill(-pid, value)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
      if (value === 0 && (error as NodeJS.ErrnoException).code === 'EPERM') {
        // Darwin can report EPERM for the just-disappeared group. A live group
        // or a failed membership observation must still fail ownership release.
        try {
          if (!(await generationGroupHasMembers(pid))) return false
        } catch (membershipError) {
          throw new AggregateError(
            [error, membershipError],
            'Cannot verify watch process group cleanup.'
          )
        }
      }
      throw error
    }
  }
  if (!(await signal('SIGTERM'))) return
  const started = Date.now()
  let killed = false
  while (await signal(0)) {
    if (!killed && Date.now() - started > 1000) killed = await signal('SIGKILL')
    if (Date.now() - started > 5000) {
      throw new Error('Watch generation process group did not close.')
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/**
 * Fresh normal Next config/env/module caches per invocation. Resolve only after
 * child exit, so a passing payload followed by a process failure cannot pass.
 * Cancellation first cooperates, then the parent reclaims its owned generation
 * group after file-worker closure. Nothing is detached from cleanup ownership.
 */
export async function runWatchProcess(
  request: WatchProcessRequest,
  options: {
    signal: AbortSignal
    /** Host-only scheduling request; generation lifetime remains independent. */
    userCancelSignal?: AbortSignal
    write(text: string): void
    writeError?: (text: string) => void
    reporter?: Omit<TestReporterOptions, 'write' | 'projectDir' | 'fileCount'>
    onEvent?: (event: ResultEvent) => void
    /** Await actual reporter console callbacks after forwarded output arrives. */
    onConsoleDrain?: () => Promise<void>
    /** Called with the exact actual event already delivered to onEvent. */
    onTestRecord?: (event: TestRecordEvent) => Promise<TestArtifact | undefined>
    /** Canonical parent-selected file, issued before its actual compilation. */
    onModuleQueued?: (entry: TestEntry) => void
    onSnapshotPreparationFailure?: (failure: SnapshotPreparationFailure) => void
    /** Direct parent facts, released only after real generation cleanup. */
    onCompletedModules?: (facts: readonly RuntimeModuleCompletion[]) => void
    /** Parent-validated actual config module files; never child-provided watch paths. */
    onRuntimeConfigurationInputs?: (files: readonly string[]) => Promise<void>
    onCustomCoverageSuite?: (fact: CustomCoverageFact) => Promise<void>
    onSnapshotCommitStart?: () => void
    onSnapshotCommitEnd?: () => void
    /** Keep event validation/aggregation but let an outer run render results. */
    report?: boolean
  }
): Promise<WatchProcessResult> {
  if (
    request.operation === 'run' &&
    request.captureCaseReady !== undefined &&
    (request.captureCaseReady !== true ||
      request.captureTaskResults !== true ||
      request.isolatedProfile !== true ||
      request.collectOnly ||
      request.projects.some(
        (project) =>
          project.isolate === false ||
          project.profile.environment !== 'node' ||
          project.profile.runtime !== 'nodejs' ||
          project.profile.bundler !== 'turbopack' ||
          project.profile.route !== undefined ||
          project.profile.browserClient !== undefined ||
          (project.executionEnvironment &&
            project.executionEnvironment.name !== 'node') ||
          project.entries.some(
            (entry) =>
              entry.executionEnvironment &&
              entry.executionEnvironment.name !== 'node'
          )
      ))
  )
    throw new Error(
      'Case Ready requires its isolated ordinary Node task-capture owner.'
    )
  if (
    (options.onTestRecord !== undefined &&
      (request.operation !== 'run' || request.captureTestRecords !== true)) ||
    (request.operation === 'run' &&
      request.captureTestRecords !== undefined &&
      (request.captureTestRecords !== true ||
        typeof options.onTestRecord !== 'function' ||
        request.isolatedProfile !== true ||
        request.watchCoverage ||
        request.userCancellation ||
        options.userCancelSignal ||
        request.collectOnly ||
        request.coverage ||
        request.standardCoverageOptions ||
        Object.keys(request.customCoverageRequests ?? {}).length > 0 ||
        request.captureTaskResults !== true ||
        request.projects.some(
          (project) =>
            project.isolate === false ||
            project.typecheck?.enabled ||
            project.profile.environment !== 'node' ||
            project.profile.route !== undefined ||
            project.profile.browserClient !== undefined ||
            (project.executionEnvironment &&
              project.executionEnvironment.name !== 'node') ||
            project.entries.some(
              (entry) =>
                entry.typecheck ||
                entry.inSource ||
                !/\.(?:js|mjs)$/.test(entry.file) ||
                (entry.executionEnvironment &&
                  entry.executionEnvironment.name !== 'node')
            )
        )))
  )
    throw new Error(
      'Test record callbacks require their actual isolated one-shot Node parent.'
    )
  if (
    request.operation === 'run' &&
    request.captureOneShotV8CollectionRestoration !== undefined &&
    (request.captureOneShotV8CollectionRestoration !== true ||
      request.isolatedProfile !== true ||
      request.watchCoverage === true ||
      request.userCancellation !== undefined ||
      options.userCancelSignal !== undefined ||
      request.collectOnly ||
      !request.standardCoverageOptions ||
      request.standardCoverageOptions.provider !== undefined)
  )
    throw new Error(
      'V8 restoration capture requires its actual isolated one-shot owner.'
    )
  if (
    request.operation === 'run' &&
    request.captureJUnitSuiteTasks !== undefined &&
    (request.captureJUnitSuiteTasks !== true ||
      request.isolatedProfile !== true ||
      request.watchCoverage ||
      request.userCancellation ||
      request.collectOnly ||
      request.coverage ||
      Object.keys(request.customCoverageRequests ?? {}).length)
  )
    throw new Error(
      'JUnit suite observation requires its positive one-shot parent owner.'
    )
  if (
    (options.onSnapshotPreparationFailure &&
      (request.operation !== 'run' ||
        request.preparePublicSnapshots !== true)) ||
    (request.operation === 'run' &&
      request.preparePublicSnapshots !== undefined &&
      (request.preparePublicSnapshots !== true ||
        !options.onSnapshotPreparationFailure ||
        request.isolatedProfile !== true ||
        request.watchCoverage ||
        request.userCancellation ||
        request.collectOnly ||
        request.coverage ||
        Object.keys(request.customCoverageRequests ?? {}).length))
  )
    throw new Error(
      'Snapshot preparation requires its positive one-shot parent observer.'
    )
  if (
    request.operation === 'run' &&
    request.captureOneShotV8ReadOnlySnapshots !== undefined &&
    (request.captureOneShotV8ReadOnlySnapshots !== true ||
      request.isolatedProfile !== true ||
      request.watchCoverage === true ||
      request.userCancellation !== undefined ||
      options.userCancelSignal !== undefined ||
      request.collectOnly ||
      request.snapshotUpdateMode !== 'none' ||
      !request.standardCoverageOptions ||
      request.standardCoverageOptions.provider !== undefined)
  )
    throw new Error(
      'V8 snapshot finishing requires its actual read-only one-shot owner.'
    )
  if (
    (options.onModuleQueued &&
      (request.operation !== 'run' || request.captureModuleQueued !== true)) ||
    (request.operation === 'run' &&
      request.captureModuleQueued !== undefined &&
      (request.captureModuleQueued !== true || !options.onModuleQueued))
  )
    throw new Error(
      'Queued module capture requires its private parent observer.'
    )
  if (
    options.onCompletedModules &&
    (request.operation !== 'run' ||
      request.isolatedProfile !== true ||
      request.collectOnly ||
      request.coverage ||
      request.standardCoverageOptions ||
      request.customCoverageRequests ||
      options.userCancelSignal ||
      request.projects.length !== 1 ||
      request.projects.some(
        (project) =>
          project.isolate === false ||
          project.typecheck?.enabled ||
          project.executionEnvironment ||
          project.profile.environment !== 'node' ||
          project.profile.route !== undefined
      ))
  )
    throw new Error(
      'Module result capture requires one isolated ordinary Node execution project.'
    )
  if (request.operation === 'run') {
    const snapshotUpdateMode = resolveSnapshotUpdateMode(request)
    request = {
      ...request,
      snapshotUpdateMode,
      updateSnapshots: snapshotUpdateMode !== 'none',
    }
  }
  if (
    options.userCancelSignal ||
    (request.operation === 'run' && request.userCancellation)
  ) {
    const browserUserCancellation =
      request.operation === 'run' &&
      !request.coverage &&
      !request.standardCoverageOptions &&
      request.projects.length > 0 &&
      request.projects.every(
        (project) =>
          project.profile.browserClient === true &&
          project.profile.environment === 'browser'
      )
    if (
      !options.userCancelSignal ||
      request.operation !== 'run' ||
      (!browserUserCancellation &&
        (request.watchCoverage !== true ||
          !request.standardCoverageOptions?.formatterReports)) ||
      request.collectOnly ||
      resolveSnapshotUpdateMode(request) === 'all' ||
      request.customCoverageRequests ||
      request.projects.some(
        (project) =>
          (!browserUserCancellation &&
            project.profile.environment !== 'node') ||
          project.profile.route !== undefined ||
          project.isolate === false
      )
    )
      throw new Error(
        'User cancellation requires configured isolated Node watch coverage.'
      )
    request = { ...request, userCancellation: true }
  }
  if (process.platform === 'win32')
    throw new Error('Test watch requires POSIX process ownership.')
  options.signal.throwIfAborted()
  const brokerModule =
    request.operation === 'run'
      ? await import('./execution/broker.js')
      : undefined
  options.signal.throwIfAborted()
  const istanbul =
    request.operation === 'run' &&
    request.standardCoverageOptions?.provider === 'istanbul'
  if (
    istanbul &&
    (request.operation !== 'run' ||
      request.isolatedProfile !== true ||
      request.watchCoverage ||
      request.projects.length !== 1)
  )
    throw new Error(
      'Istanbul isolated compilation currently requires a one-shot Node project.'
    )
  const istanbulSourcePlan =
    istanbul && request.operation === 'run'
      ? (request.istanbulSourcePlan ??
        (await (
          await import('./coverage/istanbul-instrumentation.js')
        ).createIstanbulSourcePlan({
          projectDir: request.projectDir,
          profile: request.projects[0].profile,
          config: request.standardCoverageOptions!,
          excludedFiles: [
            ...(request.coverageInputs ?? []),
            ...request.projects[0].setupFiles,
            ...request.projects[0].entries.map((entry) => entry.file),
          ],
          signal: options.signal,
        })))
      : undefined
  if (request.operation === 'run' && request.istanbulSourcePlan && !istanbul)
    throw new Error('Unrequested Istanbul source plan.')
  if (istanbulSourcePlan && request.operation === 'run') {
    if (
      !isDeepStrictEqual(
        istanbulSourcePlan.profile,
        request.projects[0].profile
      )
    )
      throw new Error(
        'Istanbul source selection has a different compiler profile.'
      )
    await (
      await import('./coverage/istanbul-instrumentation.js')
    ).assertIstanbulSourcePlan(istanbulSourcePlan, options.signal)
    request = { ...request, istanbulSourcePlan }
  }
  const typedIstanbulCandidates =
    istanbulSourcePlan?.sources.some((source) =>
      /\.(?:ts|mts|[jt]sx)$/.test(source.file)
    ) === true
  const coverageSourcePlan =
    request.operation === 'run' && request.standardCoverageOptions && !istanbul
      ? (request.coverageSourcePlan ??
        (await createCoverageSourcePlan({
          projectDir: request.projectDir,
          projects: request.projects,
          config: request.standardCoverageOptions,
          inputs: request.coverageInputs,
          includeUnimported: request.includeUnimportedCoverage,
          signal: options.signal,
        })))
      : undefined
  if (coverageSourcePlan) {
    await assertCoverageSourcePlan(coverageSourcePlan, options.signal)
    if (request.operation !== 'run')
      throw new Error(
        'Compiler coverage source analysis requires a run request'
      )
    const selectedProjects = request.projects
    if (
      coverageSourcePlan.requests.some(
        (candidate) =>
          !selectedProjects.some(
            (project) => project.profile.id === candidate.profile.id
          )
      )
    )
      throw new Error(
        'Compiler coverage source analysis has an unselected project profile'
      )
    request = { ...request, coverageSourcePlan }
  }
  const runtimeConfigurationPlan =
    request.operation === 'run' &&
    request.standardCoverageOptions &&
    (!istanbul || typedIstanbulCandidates)
      ? (request.runtimeConfigurationPlan ??
        (await createRuntimeConfigurationPlan({
          projectDir: request.projectDir,
          projects: request.projects,
          inputs: request.coverageInputs,
          signal: options.signal,
        })))
      : undefined
  if (runtimeConfigurationPlan) {
    await assertRuntimeConfigurationPlan(
      runtimeConfigurationPlan,
      options.signal
    )
    if (request.operation !== 'run')
      throw new Error('Runtime configuration requires a run request')
    assertRuntimeConfigurationSelection(
      runtimeConfigurationPlan,
      request.projectDir,
      request.projects
    )
    request = { ...request, runtimeConfigurationPlan }
  }
  const browserApplications: BrowserApplicationOwnership[] = []
  if (request.operation === 'run') {
    const { loadTestCompilerConfig } = await import(
      './compiler/watch-options.js'
    )
    for (const project of request.projects) {
      if (
        project.profile.environment !== 'browser' ||
        project.profile.browserClient
      )
        continue
      const { dir, config } = await loadTestCompilerConfig(
        request.projectDir,
        project.profile
      )
      browserApplications.push({
        profile: project.profile,
        projectDir: request.projectDir,
        distDir: resolvePath(dir, config.distDir),
        lockDistDir: Boolean(config.experimental.lockDistDir),
      })
    }
  }
  options.signal.throwIfAborted()
  let disposeReporter: (() => void) | undefined
  return new Promise<WatchProcessResult>((resolve, reject) => {
    const child = fork(require.resolve('./watch-worker'), [], {
      cwd: request.projectDir,
      env: {
        ...process.env,
        ...((request.operation === 'run' &&
          (request.isolatedProfile || isSharedRscWatchRun(request))) ||
        request.operation === 'plan'
          ? {
              NODE_ENV:
                request.operation === 'plan'
                  ? 'development'
                  : request.projects[0].profile.mode,
            }
          : {}),
      },
      execArgv: [],
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      serialization: 'advanced',
    })
    let message: WatchProcessMessage | undefined
    let failure: unknown
    let failed = false
    let ownership: Promise<void> | undefined
    let planningTimer: NodeJS.Timeout | undefined
    let abortTimer: NodeJS.Timeout | undefined
    let outputTimer: NodeJS.Timeout | undefined
    let terminalTimer: NodeJS.Timeout | undefined
    let exited = false
    let ownershipFailed = false
    let forcedCancellation = false
    const artifactDirectories = new Set<string>()
    const artifactRoots = new Set<string>()
    const istanbulSourceDeclarations: IstanbulSourceDeclarations[] = []
    const compilerSourceCoverage = new Map<string, CompilerSourceCoverage>()
    const runtimeConfigurationReceipts = new Map<
      string,
      RuntimeConfigurationReceipt
    >()
    const claimedRuntimeRevisions = new Set<string>()
    const claimedSourceRevisions = new Set<string>()
    const allocations = new Set<Promise<void>>()
    const consoleDrains = new Map<string, { forwarded(): void }>()
    const recordReceipts =
      request.operation === 'run' && request.captureTestRecords === true
        ? createTestRecordReceipts(options.signal)
        : undefined
    const reporter =
      request.operation === 'run'
        ? createTestReporter({
            ...options.reporter,
            projectDir: request.projectDir,
            fileCount: request.projects.reduce(
              (total, project) => total + project.entries.length,
              0
            ),
            watch: true,
            write: options.report === false ? () => {} : options.write,
            onError(error) {
              fail(error)
              cancel()
              options.reporter?.onError?.(error)
            },
          })
        : undefined
    disposeReporter = reporter?.dispose
    let snapshotDiagnosticsClean = true
    const snapshotPlans = new Map<
      string,
      { file: string; updates: SnapshotUpdate[]; sourceHash?: string }
    >()
    const emitResult = (event: ResultEvent) => {
      options.onEvent?.(event)
      reporter?.onEvent(event)
    }
    const began = performance.now()
    let runId: string | undefined
    let runEnd: Extract<ResultEvent, { type: 'run-end' }> | undefined
    const selectedFiles = new Set(
      request.operation === 'run'
        ? request.projects.flatMap((project) =>
            project.entries.map((entry) => entry.id)
          )
        : []
    )
    const queuedEntries = new Map(
      request.operation === 'run'
        ? request.projects.flatMap((project) =>
            project.entries.map((entry) => [entry.id, entry] as const)
          )
        : []
    )
    const observedQueuedEntries = new Set<string>()
    const observedPreparationEntries = new Set<string>()
    const launchedFiles = new Map<string, { runId: string; revision: string }>()
    let observedCaseStart = false
    const compilationFailures = new Set<string>()
    const fileOutcomes = new Map<string, string>()
    const collectionRevisions = new Map<string, string>()
    const startedFiles = new Set<string>()
    const endedFiles = new Set<string>()
    const completedModules = options.onCompletedModules
      ? new Map<string, RuntimeModuleCompletion>()
      : undefined
    const closedBrowserCancellations = new Set<string>()
    const completedBrowserFilesBeforeCancellation = new Set<string>()
    const browserFile = (id: string) =>
      request.operation === 'run' &&
      request.projects.some(
        (project) =>
          project.profile.browserClient === true &&
          project.entries.some((entry) => entry.id === id)
      )
    const fail = (error: unknown) => {
      failed = true
      failure ??= error
    }
    const customSuiteEntries = new Set<string>()
    const broker = brokerModule?.createExecutionBrokerHost({
      ...(request.operation === 'run' && request.captureCaseReady === true
        ? { captureCaseReady: true as const }
        : {}),
      ...(request.operation === 'run' &&
      request.captureTestRecords === true &&
      options.onTestRecord
        ? {
            captureTestRecords: true as const,
            async onTestRecord(artifact, execution, event, recordId, signal) {
              if (
                !artifactRoots.has(artifact.rootDir) ||
                request.operation !== 'run' ||
                request.isolatedProfile !== true
              )
                throw new Error(
                  'Test record lacks its actual parent file lease.'
                )
              const project = request.projects.find((candidate) =>
                isDeepStrictEqual(candidate.profile, artifact.profile)
              )
              const entry = project?.entries.find(
                (candidate) =>
                  candidate.id === artifact.entryId &&
                  isDeepStrictEqual(candidate, execution.entry)
              )
              if (!entry)
                throw new Error(
                  'Test record differs from actual parent selection.'
                )
              // This waiter is registered synchronously before broker publish.
              // Its received event, not the independently cloned host value,
              // is shared by the actual collector and reporter callback.
              const received = await recordReceipts!.wait(
                recordId,
                event,
                signal
              )
              signal.throwIfAborted()
              if (
                !runId ||
                received.runId !== runId ||
                collectionRevisions.get(artifact.entryId) !==
                  artifact.revision ||
                endedFiles.has(artifact.entryId)
              )
                throw new Error(
                  'Test record lacks its actual received file owner.'
                )
              return options.onTestRecord!(received)
            },
          }
        : {}),
      ...(request.operation === 'run' && request.captureJUnitSuiteTasks === true
        ? { captureJUnitSuiteTasks: true as const }
        : {}),
      ...(request.operation === 'run' &&
      request.preparePublicSnapshots === true &&
      options.onSnapshotPreparationFailure
        ? { preparePublicSnapshots: true as const }
        : {}),
      signal: options.signal,
      ...(request.operation === 'run' &&
      request.captureOneShotV8CollectionRestoration === true
        ? { captureOneShotV8CollectionRestoration: true as const }
        : {}),
      ...(request.operation === 'run' &&
      request.captureOneShotV8ReadOnlySnapshots === true
        ? { captureOneShotV8ReadOnlySnapshots: true as const }
        : {}),
      ...(options.onCompletedModules
        ? { captureCompletedModuleResult: true as const }
        : {}),
      userCancelSignal: options.userCancelSignal,
      async onConsoleDrain(signal) {
        signal.throwIfAborted()
        const id = randomUUID()
        let abort!: () => void
        const forwarded = new Promise<void>(
          (resolveForwarded, rejectForwarded) => {
            consoleDrains.set(id, { forwarded: resolveForwarded })
            abort = () => rejectForwarded(signal.reason)
            signal.addEventListener('abort', abort, { once: true })
            if (!child.connected)
              return rejectForwarded(new Error('Console drain disconnected.'))
            // The compiler receives this after earlier broker events, and echoes
            // it after forwarding them on its own ordered coordinator channel.
            child.send({ type: 'console-drain-forward', id }, (error) => {
              if (error) rejectForwarded(error)
            })
          }
        )
        try {
          await forwarded
          signal.throwIfAborted()
          await drainConsoleCallbacks(options.onConsoleDrain, signal)
          signal.throwIfAborted()
        } finally {
          void forwarded.catch(() => {})
          signal.removeEventListener('abort', abort)
          consoleDrains.delete(id)
        }
      },
      ...(options.userCancelSignal
        ? {
            onWorkerLaunched(identity) {
              // Record the actual fork before any validation/observer can throw.
              const previous = launchedFiles.get(identity.entryId)
              launchedFiles.set(identity.entryId, {
                runId: identity.runId,
                revision: identity.revision,
              })
              if (previous || !selectedFiles.has(identity.entryId))
                throw new Error('Invalid actual watch worker launch identity.')
            },
          }
        : {}),
      browserProjects:
        request.operation === 'run' ? request.projects : undefined,
      browserApplications,
      maxWorkers: request.operation === 'run' ? request.maxWorkers : undefined,
      allowCohorts:
        request.operation === 'run' &&
        (request.isolatedProfile === true || isSharedRscWatchRun(request)),
      allowCoverage:
        request.operation === 'run' &&
        (request.isolatedProfile === true ||
          (request.watchCoverage === true &&
            !!request.standardCoverageOptions)),
      ...(options.onCustomCoverageSuite
        ? {
            onCustomCoverageSuite: async (artifact, execution, completion) => {
              if (
                request.operation !== 'run' ||
                !request.isolatedProfile ||
                !artifactRoots.has(artifact.rootDir) ||
                customSuiteEntries.has(artifact.entryId)
              )
                throw new Error(
                  'Custom coverage suite lacks its parent file lease.'
                )
              const project = request.projects.find((candidate) =>
                isDeepStrictEqual(candidate.profile, artifact.profile)
              )
              const entry = project?.entries.find(
                (candidate) =>
                  candidate.id === artifact.entryId &&
                  isDeepStrictEqual(candidate, execution.entry)
              )
              if (
                !project ||
                !entry ||
                !request.customCoverageRequests ||
                !isDeepStrictEqual(
                  request.customCoverageRequests[project.profile.id],
                  execution.customCoverage
                )
              )
                throw new Error(
                  'Custom coverage suite differs from parent selection.'
                )
              const fact: CustomCoverageFact = {
                completion,
                testFiles: [
                  relative(request.projectDir, entry.file).replaceAll(
                    '\\',
                    '/'
                  ),
                ],
                environment: 'ssr',
                ...(project.displayName === undefined
                  ? {}
                  : { projectName: project.displayName }),
              }
              assertCustomCoverageFacts(
                [fact],
                request.projectDir,
                [{ ...project, entries: [entry] }],
                request.customCoverageRequests,
                new Map([[entry.id, artifact.revision]]),
                execution.runId
              )
              customSuiteEntries.add(entry.id)
              await options.onCustomCoverageSuite!(fact)
              options.signal.throwIfAborted()
            },
          }
        : {}),
      ...(typedIstanbulCandidates && istanbulSourcePlan
        ? {
            onIstanbulArtifact: async (artifact, execution, signal) => {
              if (
                !artifactRoots.has(artifact.rootDir) ||
                request.operation !== 'run'
              )
                throw new Error(
                  'Typed Istanbul runtime declarations lack their parent artifact lease.'
                )
              const entry = request.projects
                .flatMap((project) => project.entries)
                .find((candidate) => candidate.id === artifact.entryId)
              if (!entry || !isDeepStrictEqual(entry, execution.entry))
                throw new Error(
                  'Typed Istanbul runtime artifact has a foreign selected entry.'
                )
              const {
                appendIstanbulDeclarations,
                readIstanbulRuntimeDeclarations,
              } = await import('./coverage/istanbul-typescript-parent.js')
              appendIstanbulDeclarations(
                istanbulSourceDeclarations,
                await readIstanbulRuntimeDeclarations({
                  artifact,
                  entry,
                  projectDir: request.projectDir,
                  plan: istanbulSourcePlan,
                  signal,
                  assertLease() {
                    signal.throwIfAborted()
                    if (!artifactRoots.has(artifact.rootDir))
                      throw new Error('Typed Istanbul artifact lease closed.')
                  },
                })
              )
            },
            onCoverageSource: async (compiled, signal) => {
              if (
                !artifactRoots.has(compiled.artifact.rootDir) ||
                claimedSourceRevisions.has(compiled.artifact.revision)
              )
                throw new Error(
                  'Typed Istanbul compiler declarations lack their parent artifact lease.'
                )
              const {
                appendIstanbulDeclarations,
                readIstanbulCompilerDeclarations,
              } = await import('./coverage/istanbul-typescript-parent.js')
              const records = await readIstanbulCompilerDeclarations({
                compiled,
                projectDir: request.projectDir,
                plan: istanbulSourcePlan,
                configurationPlan: runtimeConfigurationPlan!,
                signal,
                assertLease() {
                  signal.throwIfAborted()
                  if (!artifactRoots.has(compiled.artifact.rootDir))
                    throw new Error(
                      'Typed Istanbul source artifact lease closed.'
                    )
                },
              })
              claimedSourceRevisions.add(compiled.artifact.revision)
              appendIstanbulDeclarations(istanbulSourceDeclarations, records)
            },
          }
        : {}),
      ...(runtimeConfigurationPlan
        ? {
            onRuntimeConfiguration: async (artifact, signal) => {
              if (
                !artifactRoots.has(artifact.rootDir) ||
                claimedRuntimeRevisions.has(artifact.revision)
              )
                throw new Error(
                  'Runtime config receipt lacks its parent artifact lease'
                )
              claimedRuntimeRevisions.add(artifact.revision)
              const staged = await prepareRuntimeConfigurationReceipt({
                artifact,
                plan: runtimeConfigurationPlan,
                artifactRoot: artifact.rootDir,
                signal,
              })
              await options.onRuntimeConfigurationInputs?.(staged.inputs)
              return async () => {
                const receipt = await staged.seal()
                runtimeConfigurationReceipts.set(
                  receipt.compiler.entryId,
                  receipt
                )
              }
            },
          }
        : {}),
      ...(coverageSourcePlan
        ? {
            onCoverageSource: async (compiled, signal) => {
              const selected = coverageSourcePlan.requests.find(
                (candidate) => candidate.revision === compiled.artifact.revision
              )
              if (
                !selected ||
                claimedSourceRevisions.has(selected.revision) ||
                !artifactRoots.has(compiled.artifact.rootDir)
              )
                throw new Error(
                  'Compiler coverage source analysis lacks a parent source/profile/artifact lease'
                )
              claimedSourceRevisions.add(selected.revision)
              const fact = await analyzeCompiledCoverageSource(
                compiled,
                {
                  projectDir: request.projectDir,
                  artifactRoot: compiled.artifact.rootDir,
                  profile: selected.profile,
                  source: selected.source,
                  revision: selected.revision,
                  configurationImports: selected.configurationImports,
                  ...(coverageSourcePlan.requests.some(
                    (candidate) =>
                      isDeepStrictEqual(candidate.profile, selected.profile) &&
                      /\.[jt]sx$/.test(candidate.source.file)
                  ) ||
                  (request.operation === 'run' &&
                    request.isolatedProfile === true &&
                    request.watchCoverage !== true &&
                    selected.profile.environment === 'node' &&
                    selected.profile.runtime === 'nodejs' &&
                    ['development', 'production'].includes(
                      selected.profile.mode
                    ) &&
                    !selected.profile.browserClient &&
                    selected.profile.route === undefined &&
                    /\.[cm]?ts$/.test(selected.source.file) &&
                    !/\.d\.[cm]?ts$/.test(selected.source.file))
                    ? {
                        nativeImportCoverageRoles: {
                          version: 1 as const,
                          assertLease() {
                            signal.throwIfAborted()
                            if (!artifactRoots.has(compiled.artifact.rootDir))
                              throw new Error(
                                'Planned JSX source artifact lease closed'
                              )
                          },
                        },
                      }
                    : {}),
                },
                signal
              )
              signal.throwIfAborted()
              compilerSourceCoverage.set(
                selected.revision,
                structuredClone(fact)
              )
            },
          }
        : {}),
      onSnapshotUpdates:
        request.operation === 'run' && request.updateSnapshots
          ? async (entryId, file, updates, sourceHash) => {
              const entry = request.projects
                .flatMap((project) => project.entries)
                .find((candidate) => candidate.id === entryId)
              if (!entry || entry.file !== file || snapshotPlans.has(entryId)) {
                throw new Error('Invalid watch snapshot update identity.')
              }
              snapshotPlans.set(entryId, {
                file,
                updates: structuredClone(updates),
                sourceHash,
              })
            }
          : undefined,
      send: (response) => {
        if (response.action === 'result') {
          if (
            completedModules &&
            response.result.moduleExecution?.closed === true
          ) {
            const completion = response.result.moduleExecution.completion
            if (
              !selectedFiles.has(response.result.entryId) ||
              completion.entryId !== response.result.entryId ||
              completedModules.has(completion.entryId)
            )
              throw new Error('Invalid actual completed module result.')
            completedModules.set(completion.entryId, completion)
          }
          if (response.result.closedUserCancellation === true)
            closedBrowserCancellations.add(response.result.entryId)
          else if (
            browserFile(response.result.entryId) &&
            !options.userCancelSignal?.aborted &&
            !response.result.notExecuted &&
            response.result.status !== 'cancelled'
          )
            completedBrowserFilesBeforeCancellation.add(response.result.entryId)
          const {
            closedUserCancellation: _closed,
            moduleExecution: _module,
            ...result
          } = response.result
          response = { ...response, result }
        }
        return new Promise<void>((sent, rejected) => {
          if (!child.connected)
            return rejected(new Error('Watch generation disconnected.'))
          child.send(response, (error) => (error ? rejected(error) : sent()))
        })
      },
    })
    const closeOwnership = () =>
      (ownership ??= (async () => {
        const errors: unknown[] = []
        let readersClosed = !broker
        let groupClosed = false
        try {
          await broker?.close()
          readersClosed = true
        } catch (error) {
          errors.push(error)
          readersClosed = broker?.ownershipClosed === true
        }
        try {
          if (child.pid) await closeGenerationGroup(child.pid)
          groupClosed = true
        } catch (error) {
          errors.push(error)
        }
        await Promise.all(allocations)
        // Do not delete immutable inputs while a failed supervisor cannot
        // certify that its readers are gone. This run cannot be reused.
        if (readersClosed && groupClosed) {
          const removals = await Promise.allSettled(
            [...artifactDirectories].map((directory) =>
              rm(directory, { recursive: true, force: true })
            )
          )
          for (const removal of removals)
            if (removal.status === 'rejected') {
              ownershipFailed = true
              errors.push(removal.reason)
            }
        } else ownershipFailed = true
        if (errors.length)
          throw new AggregateError(
            errors,
            'Watch generation cleanup failed; output ownership cannot be reused.'
          )
      })().catch((error) => {
        fail(error)
      }))
    const boundTerminalExit = () => {
      if (exited) return
      terminalTimer ??= setTimeout(() => {
        fail(
          new Error(
            'Watch process did not exit after completing or disconnecting.'
          )
        )
        void closeOwnership()
      }, 1000)
    }
    const cancel = () => {
      if (child.connected)
        child.send({ type: 'cancel' }, (error) => {
          if (error) fail(error)
        })
      // Give normal finally blocks a chance, then reclaim the same owned groups.
      // Broker closure precedes compiler termination so artifact readers finish.
      abortTimer ??= setTimeout(() => {
        forcedCancellation = options.signal.aborted
        void closeOwnership()
      }, 5000)
    }
    const cancelByUser = () => {
      if (!child.connected) return
      child.send({ type: 'user-cancel' }, (error) => {
        if (error) {
          fail(error)
          cancel()
        }
      })
    }
    const write = (data: Buffer, stream: 'stdout' | 'stderr') => {
      try {
        const target = options.reporter?.terminal
          ? (text: string) => options.reporter!.terminal!.write(text, stream)
          : stream === 'stderr'
            ? (options.reporter?.writeError ??
              options.writeError ??
              options.write)
            : options.write
        target(data.toString())
      } catch (error) {
        fail(error)
        cancel()
      }
    }
    child.stdout!.on('data', (data) => write(data, 'stdout'))
    child.stderr!.on('data', (data) => write(data, 'stderr'))
    child.on('error', fail)
    child.on(
      'message',
      (value: WatchProcessMessage | ArtifactAllocationRequest) => {
        try {
          if (broker?.handle(value)) return
        } catch (error) {
          fail(error)
          cancel()
          return
        }
        if (value?.type === 'snapshot-preparation-failure') {
          try {
            const preparationFailure = value.failure
            if (
              request.operation !== 'run' ||
              request.preparePublicSnapshots !== true ||
              !options.onSnapshotPreparationFailure ||
              !selectedFiles.has(preparationFailure.entryId) ||
              observedPreparationEntries.has(preparationFailure.entryId) ||
              !runId ||
              !collectionRevisions.has(preparationFailure.entryId)
            )
              throw new Error(
                'Unrequested or repeated supervisor snapshot preparation failure.'
              )
            assertSnapshotPreparationFailure(preparationFailure, {
              runId,
              entryId: preparationFailure.entryId,
              revision: collectionRevisions.get(preparationFailure.entryId)!,
            })
            observedPreparationEntries.add(preparationFailure.entryId)
            options.onSnapshotPreparationFailure(preparationFailure)
          } catch (error) {
            fail(error)
            cancel()
          }
          return
        }
        if (value?.type === 'module-queued') {
          try {
            const entry = queuedEntries.get(value.entryId)
            if (
              request.operation !== 'run' ||
              request.captureModuleQueued !== true ||
              !options.onModuleQueued ||
              !entry ||
              observedQueuedEntries.has(value.entryId)
            )
              throw new Error('Invalid selected module queue occurrence.')
            observedQueuedEntries.add(value.entryId)
            options.onModuleQueued(entry)
          } catch (error) {
            fail(error)
            cancel()
          }
          return
        }
        if (value?.type === 'event') {
          try {
            const event = value.event
            const isRecord =
              event.type === 'test-annotation' || event.type === 'test-artifact'
            const wrappedRecord = Object.hasOwn(value, 'recordId')
            if (
              wrappedRecord &&
              (!recordReceipts ||
                !isRecord ||
                typeof value.recordId !== 'string' ||
                !value.recordId)
            )
              throw new Error('Unrequested test record forwarding wrapper.')
            if (recordReceipts && isRecord && !wrappedRecord)
              throw new Error(
                'Captured test record lacks its actual forwarding wrapper.'
              )
            if (
              event.type === 'diagnostic' &&
              event.diagnostic.severity === 'error' &&
              !(
                request.operation === 'run' &&
                request.isolatedProfile === true &&
                request.updateSnapshots &&
                event.runId === runId &&
                event.entryId !== undefined &&
                selectedFiles.has(event.entryId) &&
                event.revision !== undefined &&
                event.revision === collectionRevisions.get(event.entryId) &&
                !snapshotPlans.has(event.entryId) &&
                event.diagnostic.phase === 'runtime' &&
                event.diagnostic.unhandled === 'rejection'
              )
            )
              snapshotDiagnosticsClean = false
            if (!reporter)
              throw new Error('Metadata process sent execution events.')
            if (event.type === 'run-start') runId = event.runId
            if (event.type === 'case-start' && launchedFiles.has(event.entryId))
              observedCaseStart = true
            if (event.type === 'file-start') {
              startedFiles.add(event.entry.id)
              if (
                request.operation === 'run' &&
                (request.collectOnly ||
                  request.captureTestRecords === true ||
                  request.preparePublicSnapshots === true ||
                  options.userCancelSignal ||
                  request.updateSnapshots ||
                  request.standardCoverageOptions ||
                  request.customCoverageRequests)
              ) {
                if (!selectedFiles.has(event.entry.id))
                  throw new Error('Unrequested collection file-start.')
                if (typeof event.revision === 'string')
                  collectionRevisions.set(event.entry.id, event.revision)
              }
            }
            if (
              request.operation === 'run' &&
              request.collectOnly &&
              [
                'case-start',
                'case-end',
                'file-collected',
                'task-update',
                'suite-end',
                'test-annotation',
                'test-artifact',
                'snapshot-summary',
              ].includes(event.type)
            )
              throw new Error('Collection process returned execution facts.')
            if (
              event.type === 'diagnostic' &&
              event.entryId &&
              selectedFiles.has(event.entryId) &&
              event.diagnostic.phase === 'compilation' &&
              event.diagnostic.severity === 'error'
            )
              compilationFailures.add(event.entryId)
            if (event.type === 'file-end') {
              endedFiles.add(event.entryId)
              fileOutcomes.set(event.entryId, event.status)
            }
            if (event.type === 'run-end') {
              if (runEnd)
                throw new Error('Watch process sent duplicate run-end events.')
              runEnd = event
            } else if (wrappedRecord) {
              recordReceipts!.receive(
                value.recordId!,
                event as TestRecordEvent,
                () => emitResult(event)
              )
            } else emitResult(event)
          } catch (error) {
            fail(error)
            cancel()
          }
          return
        }
        if (value?.type === 'console-drain-forwarded') {
          consoleDrains.get(value.id)?.forwarded()
          return
        }
        if (value?.type === 'artifact-allocation-request') {
          const allocation = (async () => {
            const response: ArtifactAllocationResponse = {
              type: 'artifact-allocation-response',
              id: value.id,
            }
            try {
              if (
                (request.operation !== 'run' && request.operation !== 'plan') ||
                ownership ||
                !isAbsolute(value.parentDir)
              )
                throw new Error('Invalid watch artifact allocation request.')
              await mkdir(value.parentDir, { recursive: true })
              const stagingDir = await mkdtemp(
                join(value.parentDir, '.next-test-pending-')
              )
              const rootDir = join(
                value.parentDir,
                `.next-test-${randomUUID()}`
              )
              artifactDirectories.add(stagingDir)
              artifactDirectories.add(rootDir)
              artifactRoots.add(rootDir)
              response.allocation = { stagingDir, rootDir }
            } catch (error) {
              response.error =
                error instanceof Error
                  ? error.message
                  : 'Watch artifact allocation failed.'
            }
            if (child.connected)
              await new Promise<void>((sent) =>
                child.send(response, (error) => {
                  if (error) fail(error)
                  sent()
                })
              )
          })().catch(fail)
          allocations.add(allocation)
          void allocation.finally(() => allocations.delete(allocation))
          return
        }
        if (
          !value ||
          typeof value !== 'object' ||
          (value.type !== 'error' && value.type !== 'result') ||
          (value.type === 'error' && typeof value.message !== 'string') ||
          (value.type === 'result' &&
            (!value.value || value.value.operation !== request.operation))
        ) {
          fail(new Error('Watch process sent an invalid terminal message.'))
          cancel()
          return
        }
        if (message)
          fail(new Error('Watch process sent duplicate terminal messages.'))
        else {
          message = value
          boundTerminalExit()
        }
      }
    )
    child.once('disconnect', () => {
      recordReceipts?.close(new Error('Test record compiler disconnected.'))
      boundTerminalExit()
    })
    child.once('exit', () => {
      recordReceipts?.close(new Error('Test record compiler exited.'))
      exited = true
      if (terminalTimer) clearTimeout(terminalTimer)
      void closeOwnership()
      // An intentionally detached descendant must not retain this lease merely
      // by inheriting stdout/stderr. Ordinary descendants are group-owned above.
      outputTimer = setTimeout(() => {
        child.stdout!.destroy()
        child.stderr!.destroy()
      }, 1000)
    })
    child.once('close', async (code, signal) => {
      if (planningTimer) clearTimeout(planningTimer)
      if (abortTimer) clearTimeout(abortTimer)
      if (outputTimer) clearTimeout(outputTimer)
      if (terminalTimer) clearTimeout(terminalTimer)
      options.signal.removeEventListener('abort', cancel)
      options.userCancelSignal?.removeEventListener('abort', cancelByUser)
      await closeOwnership()
      if (
        !failed &&
        (code !== 0 || signal) &&
        !(forcedCancellation && (signal === 'SIGTERM' || signal === 'SIGKILL'))
      )
        fail(
          new Error(
            `Watch process failed to close successfully (${signal ?? code}).`
          )
        )
      if (!failed && !options.signal.aborted) {
        if (!message) fail(new Error('Watch process closed without a result.'))
        else if (message.type === 'error') {
          try {
            if (message.queueFailure !== undefined) {
              if (
                request.operation !== 'run' ||
                request.captureModuleQueued !== true
              )
                throw new Error('Unrequested queued module transport failure.')
              const error = readQueuedModuleFailure(message.queueFailure)
              if (error.message !== message.message)
                throw new Error(
                  'Invalid queued module transport failure message.'
                )
              fail(error)
            } else fail(new Error(message.message))
          } catch (error) {
            fail(error)
          }
        } else if (
          message.type !== 'result' ||
          message.value.operation !== request.operation
        )
          fail(new Error('Watch process returned an invalid result.'))
      }
      if (
        !failed &&
        message?.type === 'result' &&
        message.value.operation === 'run' &&
        request.operation === 'run'
      ) {
        try {
          // A child cannot grant itself incomplete-coverage publication rights.
          delete message.value.standardCoverageUnavailable
          delete message.value.orderlyCancellation
          if (
            options.userCancelSignal?.aborted &&
            [...snapshotPlans.values()].some((plan) => plan.updates.length > 0)
          )
            throw new Error(
              'Cancelled coverage cannot publish snapshot writer intent.'
            )
          if (
            options.userCancelSignal?.aborted &&
            !options.signal.aborted &&
            observedCaseStart &&
            launchedFiles.size > 0 &&
            compilationFailures.size === 0 &&
            !message.value.result.unsafeCleanup
          ) {
            for (const [id, identity] of launchedFiles) {
              if (
                identity.runId !== runId ||
                identity.revision !== collectionRevisions.get(id) ||
                !endedFiles.has(id) ||
                (browserFile(id) &&
                  !closedBrowserCancellations.has(id) &&
                  !completedBrowserFilesBeforeCancellation.has(id))
              )
                throw new Error('Incomplete actual cancelled watch worker.')
            }
            if (
              ![...launchedFiles.keys()].some(browserFile) ||
              closedBrowserCancellations.size > 0
            )
              message.value.orderlyCancellation = {
                launchedEntryIds: [...launchedFiles.keys()],
                notExecutedEntryIds: [...selectedFiles].filter(
                  (id) => !launchedFiles.has(id)
                ),
              }
          }
          if (request.customCoverageRequests) {
            if (!request.isolatedProfile || message.value.result.unsafeCleanup)
              throw new Error(
                'Custom coverage requires clean one-shot supervision.'
              )
            if (
              options.signal.aborted &&
              message.value.result.status === 'cancelled'
            ) {
              // closeOwnership has certified the generation and file readers.
              // Cancellation publishes no provider payload, including a partial
              // set collected before another selected file was interrupted.
              delete message.value.result.customCoverage
            } else {
              assertCustomCoverageFacts(
                message.value.result.customCoverage,
                request.projectDir,
                request.projects,
                request.customCoverageRequests,
                collectionRevisions,
                runId
              )
            }
          } else if (message.value.result.customCoverage !== undefined)
            throw new Error('Unsolicited custom coverage facts.')
          if (
            message.value.result.istanbulSourceDeclarations !== undefined ||
            message.value.result.istanbulSourcePlan !== undefined ||
            message.value.result.compilerSourceCoverage !== undefined ||
            message.value.result.coverageSourcePlan !== undefined ||
            message.value.result.runtimeConfigurationReceipts !== undefined ||
            message.value.result.runtimeConfigurationPlan !== undefined
          )
            throw new Error(
              'Compiler child cannot supply parent declaration facts or source authorization'
            )
          if (istanbul) {
            if (message.value.result.unsafeCleanup)
              throw new Error('Istanbul coverage generation cleanup failed.')
            if (message.value.result.standardCoverage !== undefined)
              throw new Error(
                'Istanbul compilation returned unrequested V8 coverage facts.'
              )
            if (options.signal.aborted)
              delete message.value.result.istanbulCoverage
            else {
              const { assertIstanbulCoverageFacts } = await import(
                './coverage/report-istanbul.js'
              )
              await assertIstanbulCoverageFacts({
                facts: message.value.result.istanbulCoverage,
                projectDir: request.projectDir,
                plan: istanbulSourcePlan!,
                ...(typedIstanbulCandidates
                  ? { declarations: istanbulSourceDeclarations }
                  : {}),
                expected: selectedFiles,
                revisions: collectionRevisions,
                signal: options.signal,
              })
              message.value.result.istanbulSourcePlan = structuredClone(
                istanbulSourcePlan!
              )
              if (istanbulSourceDeclarations.length) {
                const receipts = [...runtimeConfigurationReceipts.values()]
                await assertRuntimeConfigurationReceipts({
                  receipts,
                  facts: message.value.result.istanbulCoverage!.filter((fact) =>
                    receipts.some(
                      (receipt) => receipt.compiler.entryId === fact.entryId
                    )
                  ),
                  plan: runtimeConfigurationPlan!,
                  signal: options.signal,
                })
                message.value.result.istanbulSourceDeclarations =
                  structuredClone(istanbulSourceDeclarations)
                message.value.result.runtimeConfigurationPlan = structuredClone(
                  runtimeConfigurationPlan!
                )
                message.value.result.runtimeConfigurationReceipts =
                  structuredClone(receipts)
              }
            }
          } else if (request.standardCoverageOptions) {
            if (message.value.result.unsafeCleanup)
              throw new Error('Standard coverage generation cleanup failed.')
            const { validateStandardWatchCoverage } = await import(
              './coverage/generation-cache.js'
            )
            if (options.signal.aborted) {
              // Superseded compilation may serialize a failed child summary.
              // An aborted generation publishes no coverage regardless of that status.
              delete message.value.result.standardCoverage
            } else {
              const facts = await validateStandardWatchCoverage({
                projectDir: request.projectDir,
                facts: message.value.result.standardCoverage,
                expected: message.value.orderlyCancellation
                  ? new Set(message.value.orderlyCancellation.launchedEntryIds)
                  : selectedFiles,
                revisions: collectionRevisions,
                status: message.value.result.status,
                terminalStatus: runEnd?.status,
                compilationFailures,
                fileOutcomes,
                allowCompilationFailure: request.watchCoverage === true,
                ...(coverageSourcePlan && runtimeConfigurationPlan
                  ? {
                      sourcePlans: {
                        sourcePlan: coverageSourcePlan,
                        runtimeConfigurationPlan,
                      },
                    }
                  : {}),
              })
              if (!facts) {
                delete message.value.result.standardCoverage
                message.value.standardCoverageUnavailable = true
              }
            }
            if (
              !options.signal.aborted &&
              !message.value.standardCoverageUnavailable
            ) {
              await assertCompilerSourceCoverage(
                [...compilerSourceCoverage.values()],
                coverageSourcePlan!,
                options.signal
              )
              await assertRuntimeConfigurationReceipts({
                receipts: [...runtimeConfigurationReceipts.values()],
                facts: message.value.result.standardCoverage!,
                plan: runtimeConfigurationPlan!,
                signal: options.signal,
              })
              message.value.result.runtimeConfigurationReceipts = [
                ...runtimeConfigurationReceipts.values(),
              ].map((receipt) => structuredClone(receipt))
              message.value.result.runtimeConfigurationPlan = structuredClone(
                runtimeConfigurationPlan!
              )
              message.value.result.compilerSourceCoverage = [
                ...compilerSourceCoverage.values(),
              ].map((fact) => structuredClone(fact))
              message.value.result.coverageSourcePlan = structuredClone(
                coverageSourcePlan!
              )
            }
          } else if (message.value.result.standardCoverage !== undefined) {
            throw new Error(
              'Watch process returned unsolicited standard coverage facts.'
            )
          }
          if (!istanbul && message.value.result.istanbulCoverage !== undefined)
            throw new Error('Unrequested Istanbul coverage facts.')
          const collections = message.value.result.collections
          if (!request.collectOnly) {
            if (collections !== undefined)
              throw new Error(
                'Watch process returned unsolicited collection facts.'
              )
          } else if (collections !== undefined) {
            assertTestFileCollections(
              collections,
              selectedFiles,
              collectionRevisions,
              message.value.result.status === 'passed'
            )
          } else if (message.value.result.status === 'passed') {
            throw new Error('Watch process omitted collection facts.')
          }
        } catch (error) {
          fail(error)
        }
      }
      // Ordinary Node one-shot runs can finish with authored BODY failures.
      // Every selected file must still provide its own qualified plan, including
      // empty plans. Real watch and other execution profiles retain their policy.
      const completedFailedNodeSnapshots =
        request.operation === 'run' &&
        request.isolatedProfile === true &&
        snapshotDiagnosticsClean &&
        request.projects.every(
          (project) => project.profile.environment === 'node'
        ) &&
        selectedFiles.size > 0 &&
        [...selectedFiles].every((entryId) => snapshotPlans.has(entryId))
      // A snapshot shortcut is a single explicit transaction. Provisional file
      // completion is insufficient: the compiler generation and every reader
      // must have exited cleanly before the parent writes any staged bytes.
      if (
        !failed &&
        !options.signal.aborted &&
        request.operation === 'run' &&
        request.updateSnapshots &&
        observedPreparationEntries.size === 0 &&
        !options.userCancelSignal?.aborted &&
        message?.type === 'result' &&
        message.value.operation === 'run' &&
        ((runEnd?.status === 'passed' &&
          message.value.result.status === 'passed') ||
          (completedFailedNodeSnapshots &&
            runEnd?.status === 'failed' &&
            message.value.result.status === 'failed')) &&
        !message.value.result.unsafeCleanup
      ) {
        try {
          const plans = combineSnapshotUpdatePlans(snapshotPlans.values())
          options.onSnapshotCommitStart?.()
          for (const { file, updates, sourceHash } of plans) {
            await commitSnapshotUpdates(file, updates, {
              projectDir: request.projectDir,
              signal: options.signal,
              sourceHash,
            })
          }
        } catch (error) {
          fail(error)
        } finally {
          try {
            options.onSnapshotCommitEnd?.()
          } catch (error) {
            fail(error)
          }
        }
      }
      if (reporter && request.operation === 'run') {
        try {
          const envelope = {
            version: 1 as const,
            runId: runId ?? randomUUID(),
            timestamp: Date.now(),
          }
          if (!runId) emitResult({ ...envelope, type: 'run-start' })
          if (failed)
            emitResult({
              ...envelope,
              type: 'diagnostic',
              diagnostic: serializeDiagnostic(failure, { phase: 'runtime' }),
            })
          if (!runEnd && !failed && !options.signal.aborted) {
            fail(
              new Error('Watch process closed without a terminal run event.')
            )
            emitResult({
              ...envelope,
              type: 'diagnostic',
              diagnostic: serializeDiagnostic(failure, { phase: 'runtime' }),
            })
          }
          for (const project of request.projects)
            for (const entry of project.entries) {
              if (endedFiles.has(entry.id)) continue
              if (
                message?.type === 'result' &&
                message.value.operation === 'run' &&
                message.value.orderlyCancellation?.notExecutedEntryIds.includes(
                  entry.id
                )
              )
                continue
              if (!startedFiles.has(entry.id))
                emitResult({ ...envelope, type: 'file-start', entry })
              emitResult({
                ...envelope,
                type: 'file-end',
                entryId: entry.id,
                status: failed ? 'failed' : 'cancelled',
                durationMs: performance.now() - began,
              })
            }
          emitResult({
            ...envelope,
            type: 'run-end',
            status:
              failed || runEnd?.status === 'failed'
                ? 'failed'
                : options.signal.aborted
                  ? 'cancelled'
                  : runEnd!.status,
            durationMs: performance.now() - began,
          })
          if (message?.type === 'result' && message.value.operation === 'run')
            message.value.result = {
              ...reporter.getSummary(),
              ...(message.value.result.collections
                ? { collections: message.value.result.collections }
                : {}),
              ...(message.value.result.standardCoverage
                ? { standardCoverage: message.value.result.standardCoverage }
                : {}),
              ...(message.value.result.istanbulCoverage
                ? {
                    istanbulCoverage: message.value.result.istanbulCoverage,
                    istanbulSourcePlan: message.value.result.istanbulSourcePlan,
                    ...(message.value.result.istanbulSourceDeclarations
                      ? {
                          istanbulSourceDeclarations:
                            message.value.result.istanbulSourceDeclarations,
                          runtimeConfigurationPlan:
                            message.value.result.runtimeConfigurationPlan,
                          runtimeConfigurationReceipts:
                            message.value.result.runtimeConfigurationReceipts,
                        }
                      : {}),
                  }
                : {}),
              ...(message.value.result.compilerSourceCoverage
                ? {
                    compilerSourceCoverage:
                      message.value.result.compilerSourceCoverage,
                    coverageSourcePlan: message.value.result.coverageSourcePlan,
                    runtimeConfigurationReceipts:
                      message.value.result.runtimeConfigurationReceipts,
                    runtimeConfigurationPlan:
                      message.value.result.runtimeConfigurationPlan,
                  }
                : {}),
              ...(message.value.result.customCoverage
                ? { customCoverage: message.value.result.customCoverage }
                : {}),
              unsafeCleanup: message.value.result.unsafeCleanup,
            }
        } catch (error) {
          fail(error)
        }
      }
      if (
        !failed &&
        !options.signal.aborted &&
        message?.type === 'result' &&
        message.value.operation === 'run' &&
        !message.value.result.unsafeCleanup &&
        completedModules
      ) {
        try {
          options.onCompletedModules!([...completedModules.values()])
        } catch (error) {
          fail(error)
        }
      }
      if (failed)
        reject(ownershipFailed ? new WatchOwnershipError(failure) : failure)
      else if (options.signal.aborted) reject(options.signal.reason)
      else if (message?.type === 'result') resolve(message.value)
      else reject(new Error('Watch process returned no result.'))
    })
    if (request.operation === 'plan')
      planningTimer = setTimeout(() => {
        fail(
          new Error('Test source dependency planning exceeded its deadline.')
        )
        cancel()
      }, 60_000)
    options.signal.addEventListener('abort', cancel, { once: true })
    child.send({ type: 'start', request }, (error) => {
      if (error) fail(error)
      if (options.signal.aborted) cancel()
      options.userCancelSignal?.addEventListener('abort', cancelByUser, {
        once: true,
      })
      if (options.userCancelSignal?.aborted) cancelByUser()
    })
  }).finally(() => {
    disposeReporter?.()
  })
}
