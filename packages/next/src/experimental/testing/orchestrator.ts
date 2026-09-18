import { randomUUID } from 'crypto'
import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import { isAbsolute, join } from 'path'
import type {
  CompiledTestArtifact,
  ExecuteTest,
  TestEntry,
  TestCompilerSessionOptions,
} from './contracts'
import { requireTestCapability } from './capabilities'
import type { DiscoveredTestProject } from './discovery'
import type { ResultEvent, SerializedDiagnostic } from './reporting/events'
import { serializeDiagnostic } from './reporting/diagnostics'
import {
  createTestReporter,
  type TestReporterOptions,
} from './reporting/reporter'

interface PreparedTest {
  entry: TestEntry
  artifact: CompiledTestArtifact
  started: number
}

export interface RunTestsOptions {
  signal: AbortSignal
  write(text: string): void
  reporter?: Omit<TestReporterOptions, 'write' | 'projectDir' | 'fileCount'>
  coverage?: boolean
  updateSnapshots?: boolean
  testNamePattern?: string
  /** Watch uses a parent-owned execution broker; compilation stays in this process. */
  execute?: ExecuteTest
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
  if (options.coverage && options.updateSnapshots) {
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
          (project.profile.mode !== 'development' ||
            project.profile.environment !== 'node' ||
            project.profile.route !== undefined)
      )
    ) {
      throw new Error('Coverage requires route-less development Node profiles.')
    }
  }
  if (options.updateSnapshots) {
    requireTestCapability('snapshotUpdate')
    const selected = projects.filter((project) => project.entries.length > 0)
    if (selected.some((project) => project.profile.environment === 'browser')) {
      throw new Error(
        'Browser snapshot updates require parent-owned snapshot commit after browser cleanup.'
      )
    }
    if (
      selected.some(
        (project) =>
          project.profile.mode !== 'development' ||
          project.profile.route !== undefined
      )
    ) {
      throw new Error(
        'Snapshot updates require route-less development Node or RSC profiles.'
      )
    }
  }
  const coverageModule = options.coverage
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
  let failed = false
  let unsafeCleanup = false
  const startedFiles = new Set<string>()
  const endedFiles = new Set<string>()
  const previousNodeEnv = process.env.NODE_ENV
  const envelope = () => ({ version: 1 as const, runId, timestamp: Date.now() })

  function onEvent(event: ResultEvent) {
    if (event.type === 'file-start') startedFiles.add(event.entry.id)
    if (event.type === 'file-end') endedFiles.add(event.entryId)
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
    { entry, artifact, started: fileStarted }: PreparedTest,
    project: DiscoveredTestProject
  ) {
    let serverModule: typeof import('./browser/server') | undefined
    let server: import('./browser/server').ApplicationServer | undefined
    let browserHost: import('./browser/host').BrowserHost | undefined
    let browser: import('./contracts').ExecuteTestOptions['browser']
    let acquiringResource = false
    const ownsFileEnd = project.profile.environment === 'browser'
    const executionStarted = performance.now()
    let pendingFileEnd: Extract<ResultEvent, { type: 'file-end' }> | undefined
    let executionStatus:
      | import('./reporting/events').FileResult['status']
      | undefined
    let fileFailed = false
    let coverageReceived = false
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
      if (options.coverage && (artifact.moduleMocking || !artifact.coverage)) {
        throw new Error(
          'Coverage requires an instrumented development Node artifact without module mocks.'
        )
      }
      if (project.profile.environment === 'browser') {
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
      const result = await execute(artifact, {
        runId,
        projectDir,
        entry,
        setupFiles: project.setupFiles,
        updateSnapshots: options.updateSnapshots ?? false,
        ...(coverageReport
          ? {
              coverage: { version: 1 as const, kind: 'node-line' as const },
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
                  coverageReport.incomplete(entry.id, completion.error.message)
                  throw new Error('Coverage collection did not complete.')
                }
                const { remapCoverage } = await import('./coverage/remap.js')
                const remapped = await remapCoverage(artifact, completion.data)
                coverageReport.add(remapped)
                if (!remapped.complete || remapped.errors.length > 0) {
                  throw new Error('Coverage remapping did not complete.')
                }
              },
            }
          : {}),
        testTimeout: project.testTimeout,
        hookTimeout: project.hookTimeout,
        testNamePattern: options.testNamePattern,
        fileTimeout: project.fileTimeout,
        signal: controller.signal,
        onEvent: executionEvent,
        ...(browser ? { browser } : {}),
      })
      if (coverageReport && !coverageReceived && !controller.signal.aborted) {
        throw new Error('Worker completed without coverage collection.')
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
      if (acquiringResource) {
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

  try {
    onEvent({ ...envelope(), type: 'run-start' })
    const selected = projects.filter((project) => project.entries.length > 0)
    const modes = new Set(selected.map((project) => project.profile.mode))
    if (!selected.length) {
      diagnostic(new Error('No test files selected.'), 'configuration')
    } else if (modes.size !== 1) {
      diagnostic(
        new Error(
          'Run development and production test projects separately using --project. Mixed compilation modes are not supported in one process.'
        ),
        'configuration'
      )
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
          let session:
            | Awaited<
                ReturnType<
                  typeof import('./compiler').createTestCompilerSession
                >
              >
            | undefined
          let projectPhase: SerializedDiagnostic['phase'] = 'compilation'
          try {
            const { createTestCompilerSession } = await import(
              './compiler/index.js'
            )
            session = await createTestCompilerSession(
              projectDir,
              project.profile,
              { allocateArtifact: options.allocateArtifact }
            )
            const browserTests: PreparedTest[] = []
            for (const entry of project.entries) {
              if (controller.signal.aborted) break
              const fileStarted = performance.now()
              try {
                const artifact = await session.compile(entry, {
                  signal: controller.signal,
                  setupFiles: project.setupFiles,
                  ...(options.coverage
                    ? {
                        coverage: {
                          version: 1 as const,
                          kind: 'node-line' as const,
                        },
                      }
                    : {}),
                })
                for (const issue of artifact.diagnostics) {
                  if (issue.severity === 'error') failed = true
                  onEvent({
                    ...envelope(),
                    type: 'diagnostic',
                    entryId: entry.id,
                    revision: artifact.revision,
                    diagnostic: issue,
                  })
                }
                if (
                  artifact.diagnostics.some(
                    (issue) => issue.severity === 'error'
                  )
                ) {
                  finishFailedFile(entry, fileStarted)
                  continue
                }
                controller.signal.throwIfAborted()
                const prepared = { entry, artifact, started: fileStarted }
                if (project.profile.environment === 'browser') {
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
            if (browserTests.length && !controller.signal.aborted) {
              projectPhase = 'cleanup'
              // Release actual native output/cache ownership before Next's
              // normal app server takes its output lock. Keep snapshots leased.
              await session.shutdownCompilation()
              for (const prepared of browserTests) {
                if (controller.signal.aborted) break
                await executePrepared(prepared, project)
              }
            }
          } catch (error) {
            if (!isOnlyCancellation(error)) {
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
  return { ...reporter.getSummary(), unsafeCleanup }
}
