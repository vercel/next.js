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
import type { CustomCoverageRequest } from './coverage/custom-types'
import { assertCustomCoverageFacts } from './coverage/custom-facts'
import { fork, execFile } from 'child_process'
import type {
  StandardCoverageOptions,
  CompilerSourceCoverage,
} from './coverage/types'
import { promisify } from 'node:util'
import { randomUUID } from 'crypto'
import { mkdir, mkdtemp, rm } from 'fs/promises'
import { join, isAbsolute, resolve as resolvePath } from 'path'
import type { DiscoveredTestProject } from './discovery'
import type { TestProfile } from './contracts'
import type { WatchDirectories } from './incremental/watch-files'
import type { runTests } from './orchestrator'
import type { ResultEvent } from './reporting/events'
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
      captureTaskResults?: boolean
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
      maxWorkers?: number
      coverage?: boolean
      standardCoverageOptions?: StandardCoverageOptions
      /** Issued by an outer parent profile coordinator or this process before fork. */
      coverageSourcePlan?: CoverageSourcePlan
      runtimeConfigurationPlan?: RuntimeConfigurationPlan
      coverageInputs?: readonly string[]
      includeUnimportedCoverage?: boolean
      customCoverageRequests?: Record<string, CustomCoverageRequest>
      /** One-shot mixed-profile orchestration; never inherit another mode. */
      isolatedProfile?: boolean
      /** Explicit standard watch generation; parent owns retained facts/publication. */
      watchCoverage?: boolean
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
      /** Parent-sealed failed compilation; no partial coverage can publish. */ standardCoverageUnavailable?: true
    }

export type WatchProcessMessage =
  | { type: 'result'; value: WatchProcessResult }
  | { type: 'error'; message: string }
  | { type: 'event'; event: ResultEvent }

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
    write(text: string): void
    writeError?: (text: string) => void
    reporter?: Omit<TestReporterOptions, 'write' | 'projectDir' | 'fileCount'>
    onEvent?: (event: ResultEvent) => void
    /** Parent-validated actual config module files; never child-provided watch paths. */
    onRuntimeConfigurationInputs?: (files: readonly string[]) => Promise<void>
    onSnapshotCommitStart?: () => void
    onSnapshotCommitEnd?: () => void
    /** Keep event validation/aggregation but let an outer run render results. */
    report?: boolean
  }
): Promise<WatchProcessResult> {
  if (request.operation === 'run') {
    const snapshotUpdateMode = resolveSnapshotUpdateMode(request)
    request = {
      ...request,
      snapshotUpdateMode,
      updateSnapshots: snapshotUpdateMode !== 'none',
    }
  }
  if (process.platform === 'win32')
    throw new Error('Test watch requires POSIX process ownership.')
  options.signal.throwIfAborted()
  const brokerModule =
    request.operation === 'run'
      ? await import('./execution/broker.js')
      : undefined
  options.signal.throwIfAborted()
  const coverageSourcePlan =
    request.operation === 'run' && request.standardCoverageOptions
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
    request.operation === 'run' && request.standardCoverageOptions
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
        ...((request.operation === 'run' && request.isolatedProfile) ||
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
    const compilerSourceCoverage = new Map<string, CompilerSourceCoverage>()
    const runtimeConfigurationReceipts = new Map<
      string,
      RuntimeConfigurationReceipt
    >()
    const claimedRuntimeRevisions = new Set<string>()
    const claimedSourceRevisions = new Set<string>()
    const allocations = new Set<Promise<void>>()
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
    const compilationFailures = new Set<string>()
    const fileOutcomes = new Map<string, string>()
    const collectionRevisions = new Map<string, string>()
    const startedFiles = new Set<string>()
    const endedFiles = new Set<string>()
    const fail = (error: unknown) => {
      failed = true
      failure ??= error
    }
    const broker = brokerModule?.createExecutionBrokerHost({
      signal: options.signal,
      browserProjects:
        request.operation === 'run' ? request.projects : undefined,
      browserApplications,
      maxWorkers: request.operation === 'run' ? request.maxWorkers : undefined,
      allowCohorts:
        request.operation === 'run' && request.isolatedProfile === true,
      allowCoverage:
        request.operation === 'run' &&
        (request.isolatedProfile === true ||
          (request.watchCoverage === true &&
            !!request.standardCoverageOptions)),
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
      send: (response) =>
        new Promise<void>((sent, rejected) => {
          if (!child.connected)
            return rejected(new Error('Watch generation disconnected.'))
          child.send(response, (error) => (error ? rejected(error) : sent()))
        }),
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
        if (value?.type === 'event') {
          try {
            const event = value.event
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
            if (event.type === 'file-start') {
              startedFiles.add(event.entry.id)
              if (
                request.operation === 'run' &&
                (request.collectOnly ||
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
            } else emitResult(event)
          } catch (error) {
            fail(error)
            cancel()
          }
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
    child.once('disconnect', boundTerminalExit)
    child.once('exit', () => {
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
        else if (message.type === 'error') fail(new Error(message.message))
        else if (
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
            message.value.result.compilerSourceCoverage !== undefined ||
            message.value.result.coverageSourcePlan !== undefined ||
            message.value.result.runtimeConfigurationReceipts !== undefined ||
            message.value.result.runtimeConfigurationPlan !== undefined
          )
            throw new Error(
              'Compiler child cannot supply parent declaration facts or source authorization'
            )
          if (request.standardCoverageOptions) {
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
                expected: selectedFiles,
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
    })
  }).finally(() => {
    disposeReporter?.()
  })
}
