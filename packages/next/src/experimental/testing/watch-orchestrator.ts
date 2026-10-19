import {
  createRuntimeConfigurationPlan,
  type RuntimeConfigurationReceipt,
} from './coverage/runtime-configuration'
import { createCoverageSourcePlan } from './coverage/source-analysis-plan'
import type { CompilerSourceCoverage } from './coverage/types'
import { createHash, randomUUID } from 'crypto'
import type { StandardCoverageOptions } from './coverage/types'
import { createStandardCoverageGenerationCache } from './coverage/generation-cache'
import { publishStandardCoverage } from './coverage/report-standard'
import { readdir } from 'node:fs/promises'
import { dirname, resolve } from 'path'
import { serialize } from 'node:v8'
import type { SnapshotUpdateMode } from './assertions/snapshots'
import { snapshotWatchRegistry } from './incremental/registry-additions'
import {
  createWatchKeyboard,
  type WatchCommand,
} from './incremental/watch-keyboard'
import {
  applyTestConfigOverrides,
  openTestConfiguration,
  type TestConfigOverrides,
} from './config'
import { discoverTests, type DiscoveredTestProject } from './discovery'
import {
  createWatchSession,
  type WatchDiscovery,
  type WatchRunResult,
} from './incremental/watch-session'
import {
  watchTestFiles,
  type WatchDirectories,
} from './incremental/watch-files'
import { runWatchProcess, WatchOwnershipError } from './watch-process'
import type { ResultEvent } from './reporting/events'
import { createMachineReporter, type ResultReporter } from './reporting/machine'
import {
  formatWatchStatus,
  type TestReporterOptions,
} from './reporting/reporter'

interface Discovery extends WatchDiscovery {
  projects: DiscoveredTestProject[]
  directories: WatchDirectories
  updateSnapshots?: boolean
  snapshotUpdateMode?: SnapshotUpdateMode
  testNamePattern?: string | RegExp
  maxWorkers: number
}

/** Fresh compilation/execution per generation; the scheduler owns no output writer. */
export async function watchTests(
  projectDir: string,
  options: {
    input?: NodeJS.ReadStream
    output?: NodeJS.WriteStream
    project?: string
    files?: string[]
    testNamePattern?: string | RegExp
    maxWorkers?: number
    standardCoverageOptions?: StandardCoverageOptions
    resultReporters?: readonly ResultReporter[]
    outputFile?: string
    writeReport?(text: string): void
    resultPresentation?: Omit<
      TestReporterOptions,
      'write' | 'projectDir' | 'style'
    >
    snapshotUpdateMode?: SnapshotUpdateMode
    configOverrides?: TestConfigOverrides
    signal: AbortSignal
    write(text: string): void
    writeError?(text: string): void
    reporter?: Omit<TestReporterOptions, 'write' | 'projectDir' | 'fileCount'>
    /** Observe the parent-sealed results, including authoritative cleanup failures. */
    onEvent?: (event: ResultEvent) => void
  }
): Promise<{ status: 'passed' | 'failed' | 'cancelled' }> {
  // Caller-owned option objects cannot alter a retained generation's source selection.
  const standardCoverageOptions = options.standardCoverageOptions
    ? structuredClone(options.standardCoverageOptions)
    : undefined
  const controller = new AbortController()
  const cancel = () => controller.abort(options.signal.reason)
  if (options.signal.aborted) cancel()
  else options.signal.addEventListener('abort', cancel, { once: true })
  let selectedProject = options.project
  let selectedFiles = options.files
  let testNamePattern = options.testNamePattern
  let clearConfiguredNamePattern = false
  const machineEnabled =
    options.resultReporters?.some((name) => name !== 'default') ?? false
  const human = options.resultReporters?.includes('default') ?? true
  let updateSnapshots = false
  let running = true
  let committingSnapshots = false
  let changedDuringCommit = false
  const verifiedActiveConfigurationFiles = new Set<string>()
  let failedOnly = false
  let failedSelection = new Set<string>()
  const failedEntries = new Set<string>()
  let latestStatus: 'passed' | 'failed' = 'passed'
  let hasFailedRun = false
  let quitting = false
  let keyboardCancelled = false
  let keyboard: ReturnType<typeof createWatchKeyboard> | undefined
  let fatal = false
  let hasRun = false
  let coverageHasPublished = false
  let coverageAllTestsRun = false
  const coverageCache = createStandardCoverageGenerationCache(projectDir)
  const failures: unknown[] = []
  let watcher: Awaited<ReturnType<typeof watchTestFiles>> | undefined
  let session: ReturnType<typeof createWatchSession<Discovery>> | undefined

  let configuration:
    | Awaited<ReturnType<typeof openTestConfiguration>>
    | undefined

  async function discover(signal: AbortSignal): Promise<Discovery> {
    signal.throwIfAborted()
    if (
      !configuration ||
      !(await configuration.retainCompilerTransformsForWatch(controller.signal))
    ) {
      await configuration?.dispose()
      configuration = undefined
      configuration = await openTestConfiguration(projectDir, signal)
      await configuration.retainCompilerTransformsForWatch(
        controller.signal,
        true
      )
    }
    const config = applyTestConfigOverrides(
      configuration.config,
      options.configOverrides ?? {}
    )
    const projects = await discoverTests(projectDir, config, {
      project: selectedProject,
      files: selectedFiles,
    })
    if (failedOnly) {
      const selectedFailures = failedSelection
      for (const project of projects) {
        project.entries = project.entries.filter((entry) =>
          selectedFailures.has(entry.id)
        )
      }
    }
    if (
      projects.some(
        ({ profile }) =>
          profile.mode !== 'development' ||
          profile.runtime !== 'nodejs' ||
          profile.bundler !== 'turbopack' ||
          profile.route !== undefined
      )
    ) {
      throw new Error(
        'Test watch supports route-less development profiles with Turbopack only.'
      )
    }
    const metadata = await runWatchProcess(
      {
        operation: 'metadata',
        projectDir,
        profiles: projects.map((project) => project.profile),
      },
      { signal, write: options.write, reporter: options.reporter }
    ).catch((error) => {
      if (error instanceof WatchOwnershipError) {
        fatal = true
        try {
          report(error)
        } catch (reporterError) {
          failures.push(error, reporterError)
        }
        controller.abort(error)
      }
      throw error
    })
    if (metadata.operation !== 'metadata')
      throw new Error('Invalid watch metadata result.')
    const directories = metadata.directories
    if (
      configuration.compilerTransformNames.length ||
      projects.some((project) => project.compilerAliases)
    ) {
      directories.dependencyFiles = configuration.watchInputs
      directories.directories = [
        ...directories.directories,
        ...configuration.watchInputs.map((file) => dirname(file)),
      ]
    }
    directories.outputDirectories = [
      ...directories.outputDirectories,
      resolve(projectDir, '.next-test-snapshot-journals'),
      ...(standardCoverageOptions
        ? [resolve(projectDir, standardCoverageOptions.reportsDirectory)]
        : []),
    ]
    if (standardCoverageOptions) {
      directories.artifactDirectories = [
        ...(directories.artifactDirectories ?? []),
        {
          parentDirectory: resolve(
            projectDir,
            standardCoverageOptions.reportsDirectory,
            '..'
          ),
          basenamePrefixes: [
            '.next-test-coverage-',
            '.next-test-coverage-backup-',
          ],
        },
      ]
    }
    if (machineEnabled && options.outputFile) {
      directories.outputFiles = [
        ...(directories.outputFiles ?? []),
        resolve(projectDir, options.outputFile),
      ]
    }
    signal.throwIfAborted()
    try {
      await watcher?.update(directories)
    } catch (error) {
      // The source has closed its subscriptions on update failure; waiting for
      // another edit would leave a live scheduler with no change source.
      fatal = true
      controller.abort(error)
      try {
        report(error)
      } catch (reporterError) {
        failures.push(reporterError)
      }
      throw error
    }
    const configurationRevision = createHash('sha256')
      .update(
        serialize({
          config,
          rootProject: configuration.watchRootProject,
          projects: projects.map(
            ({ entries: _entries, ...project }) => project
          ),
          directories,
          selectedProject,
          selectedFiles,
          testNamePattern,
          clearConfiguredNamePattern,
          maxWorkers: options.maxWorkers,
          standardCoverageOptions,
        })
      )
      .digest('hex')
    const configurationSources = (await readdir(projectDir))
      .filter(
        (file) =>
          /^(?:next(?:\.test)?|vitest|vite)\.config\./.test(file) ||
          /^(?:(?:ts|js)config\.json|package\.json|\.env(?:\..*)?)$/.test(file)
      )
      .map((file) => resolve(projectDir, file))
    const registry = await snapshotWatchRegistry({
      configurationRevision,
      entries: projects.flatMap((project) => project.entries),
      inputs: [
        ...configurationSources,
        ...configuration.watchInputs,
        ...projects.flatMap((project) => [
          ...project.setupFiles,
          ...(project.snapshotSerializers ?? []).map((file) =>
            resolve(projectDir, file)
          ),
          ...(project.globalSetup ?? []).map((file) =>
            resolve(projectDir, file)
          ),
        ]),
      ],
      signal,
    })
    return {
      projects,
      registry,
      maxWorkers: options.maxWorkers ?? config.maxWorkers,
      directories,
      entryIds: projects.flatMap((project) =>
        project.entries.map((entry) => entry.id)
      ),
      // Only test configuration and identities; never resolved Next env/config values.
      discoveryRevision: createHash('sha256')
        .update(serialize(projects))
        .digest('hex'),
    }
  }

  function report(error: unknown) {
    latestStatus = 'failed'
    hasFailedRun = true
    ;(options.writeError ?? options.reporter?.writeError ?? options.write)(
      `Test watch error: ${error instanceof Error ? error.message : 'Unknown failure'}\n`
    )
    if (!controller.signal.aborted) {
      options.write(
        `Watching for file changes.${keyboard?.enabled ? ' Press h for help.' : ''}\n`
      )
    }
  }

  function onCommand(command: WatchCommand) {
    if (controller.signal.aborted) return
    switch (command.type) {
      case 'cancel':
        keyboardCancelled = true
        session?.cancelCurrent()
        return
      case 'update':
        if (standardCoverageOptions) {
          options.write(
            '--coverage cannot be combined with snapshot updates.\n'
          )
          return
        }
        failedSelection = new Set(failedEntries)
        updateSnapshots = true
        failedOnly = failedEntries.size > 0
        break
      case 'name':
        coverageAllTestsRun = !command.value
        testNamePattern = command.value || undefined
        clearConfiguredNamePattern = !command.value
        if (!command.value) selectedFiles = undefined
        failedOnly = false
        break
      case 'quit':
        quitting = true
        controller.abort(new Error('Test watch closed.'))
        return
      case 'interrupt':
        controller.abort(new Error('Test watch interrupted.'))
        return
      case 'all':
        coverageAllTestsRun = true
        testNamePattern = undefined
        clearConfiguredNamePattern = true
        selectedFiles = undefined
        failedOnly = false
        break
      case 'rerun':
        coverageAllTestsRun = true
        failedOnly = false
        break
      case 'failed':
        coverageAllTestsRun = false
        failedSelection = new Set(failedEntries)
        failedOnly = true
        break
      case 'files':
        coverageAllTestsRun = !command.value
        selectedFiles = command.value ? [command.value] : undefined
        failedOnly = false
        break
      case 'project':
        coverageAllTestsRun = true
        selectedProject = command.value || undefined
        failedOnly = false
        break
    }
    session?.invalidate({ invalidateAll: true })
  }

  try {
    if (options.input && options.output) {
      keyboard = createWatchKeyboard({
        input: options.input,
        output: options.output,
        onCommand,
        isRunning: () => running,
        write: (text) =>
          options.reporter?.terminal
            ? options.reporter.terminal.write(text)
            : options.write(text),
        onPromptChange(active) {
          if (active) options.reporter?.terminal?.suspend()
          else options.reporter?.terminal?.resume()
        },
        onError(error) {
          fatal = true
          failures.push(error)
          controller.abort(error)
        },
      })
    }
    const initial = await discover(controller.signal)
    watcher = await watchTestFiles({
      ...initial.directories,
      // Paths can establish the matching-new-test policy after byte validation;
      // they never establish complete compiler dependencies for source changes.
      onChange: (change) => {
        const activeConfigReload = [...change.changed, ...change.removed].some(
          (file) => verifiedActiveConfigurationFiles.has(file)
        )
        // An observed active config reload starts a new complete config run.
        // Helper-only edits do not gain this source-expansion authority.
        if (activeConfigReload) coverageAllTestsRun = true
        if (committingSnapshots) changedDuringCommit = true
        else
          session?.invalidate({
            registryPaths: change.removed.length ? undefined : change.changed,
            invalidateAll: activeConfigReload,
          })
      },
      onError(error) {
        fatal = true
        controller.abort(error)
        try {
          report(error)
        } catch (reporterError) {
          failures.push(reporterError)
        }
      },
    })
    session = createWatchSession<Discovery>({
      signal: controller.signal,
      runEmpty: machineEnabled || !!standardCoverageOptions,
      onRunSettled(status, discovery) {
        if (status !== 'passed' && status !== 'failed') return
        if (!discovery.entryIds.length) {
          options.write(
            `No test files matched. Watching for file changes.${keyboard?.enabled ? ' Press h for help.' : ''}\n`
          )
        }
        if (
          discovery.entryIds.length ||
          machineEnabled ||
          standardCoverageOptions
        )
          options.write(
            formatWatchStatus(
              status,
              options.reporter?.color,
              keyboard?.enabled
            )
          )
      },
      async discover(signal) {
        const updateThisRun = updateSnapshots
        updateSnapshots = false
        keyboardCancelled = false
        running = true
        try {
          const discovery = await discover(signal)
          return {
            ...discovery,
            updateSnapshots: updateThisRun,
            snapshotUpdateMode: updateThisRun
              ? 'all'
              : (options.snapshotUpdateMode ?? 'none'),
            testNamePattern:
              testNamePattern ??
              (clearConfiguredNamePattern &&
              discovery.projects.some(
                (project) => project.testNamePattern !== undefined
              )
                ? ''
                : undefined),
          }
        } finally {
          running = false
          if (
            signal.aborted &&
            keyboardCancelled &&
            !controller.signal.aborted
          ) {
            options.write(
              `Test discovery cancelled. Watching for file changes.${keyboard?.enabled ? ' Press h for help.' : ''}\n`
            )
          }
        }
      },
      async run({ discovery, selection, signal }) {
        running = true
        const coverageConfig = standardCoverageOptions
        const selected = new Set(
          coverageConfig
            ? await coverageCache.selectEntryIds({
                registry: discovery.registry,
                entryIds: discovery.entryIds,
                selected: selection.entryIds,
                cleanOnRerun: coverageConfig.cleanOnRerun,
                requireRuntimeConfiguration: true,
                signal,
              })
            : selection.entryIds
        )
        // Initial starts and explicit full reruns include untouched sources.
        // A cancelled generation cannot consume this publication intent.
        const includeUnimported =
          coverageConfig?.cleanOnRerun === false ||
          !coverageHasPublished ||
          coverageAllTestsRun
        const projects = discovery.projects.map((project) => ({
          ...project,
          entries: project.entries.filter((entry) => selected.has(entry.id)),
        }))
        const coverageSourcePlan = coverageConfig
          ? await createCoverageSourcePlan({
              projectDir,
              projects: discovery.projects,
              config: coverageConfig,
              inputs: configuration?.watchInputs,
              includeUnimported,
              signal,
            })
          : undefined
        const runtimeConfigurationPlan = coverageConfig
          ? await createRuntimeConfigurationPlan({
              projectDir,
              projects,
              inputs: configuration?.watchInputs,
              signal,
            })
          : undefined
        let runtimeConfigurationReceipts: RuntimeConfigurationReceipt[] = []
        let compilerSourceCoverage: CompilerSourceCoverage[] = []
        const machine = machineEnabled
          ? createMachineReporter({
              projectDir,
              reporters: options.resultReporters!,
              outputFile: options.outputFile,
              write: options.writeReport ?? options.write,
              writeError: options.writeError,
              presentation: {
                ...(options.resultPresentation ?? options.reporter),
                watch: true,
                rerun: hasRun,
              },
            })
          : undefined
        let terminalRun = false
        let terminalEvent: Extract<ResultEvent, { type: 'run-end' }> | undefined
        let terminalReleased = false
        let publicationStarted = false
        let completedResult: WatchRunResult | undefined
        let reporterFailed = false
        const coverageRevisions = new Map<string, string>()
        const fileOutcomes = new Map<
          string,
          'passed' | 'failed' | 'skipped' | 'cancelled'
        >()
        const forwardEvent = (event: ResultEvent) => {
          try {
            machine?.onEvent(event)
            if (
              event.type === 'file-start' &&
              typeof event.revision === 'string'
            ) {
              coverageRevisions.set(event.entry.id, event.revision)
            }
            if (event.type === 'file-end') {
              fileOutcomes.set(event.entryId, event.status)
            }
            options.onEvent?.(event)
          } catch (error) {
            reporterFailed = true
            throw error
          }
        }
        const onEvent = (event: ResultEvent) => {
          if (event.type === 'run-end') {
            if (terminalEvent)
              throw new Error(
                'Watch generation received duplicate terminal events.'
              )
            terminalEvent = structuredClone(event)
            terminalRun = true
          } else forwardEvent(event)
        }
        function releaseTerminal(status?: 'passed' | 'failed' | 'cancelled') {
          if (!terminalEvent || terminalReleased)
            throw new Error(
              'Watch generation cannot publish its terminal event.'
            )
          terminalReleased = true
          forwardEvent({
            ...terminalEvent,
            timestamp: Date.now(),
            status: status ?? terminalEvent.status,
          })
        }
        function coverageDiagnostic(message: string) {
          if (!terminalEvent)
            throw new Error('Watch coverage requires a sealed terminal event.')
          forwardEvent({
            version: 1,
            runId: terminalEvent.runId,
            timestamp: Date.now(),
            type: 'diagnostic',
            diagnostic: { phase: 'runtime', severity: 'error', message },
          })
        }
        async function publishCoverage(
          facts: unknown,
          status: 'passed' | 'failed'
        ) {
          if (!coverageConfig) return false
          const prepared = await coverageCache.prepare({
            facts,
            expected: selected,
            revisions: coverageRevisions,
            registry: discovery.registry,
            cleanOnRerun: coverageConfig.cleanOnRerun,
            runtimeConfiguration: {
              plan: runtimeConfigurationPlan!,
              receipts: runtimeConfigurationReceipts,
            },
            signal,
          })
          const coverage = await publishStandardCoverage({
            projectDir,
            facts: prepared.facts,
            expected: prepared.expected,
            excludedFiles: discovery.projects.flatMap((project) => [
              ...project.setupFiles,
              ...project.entries.map((entry) => entry.file),
            ]),
            config: coverageConfig,
            status,
            includeUnimported,
            runtimeConfiguration: {
              receipts: prepared.runtimeConfigurationReceipts!,
            },
            ...(coverageSourcePlan
              ? {
                  sourceAnalysis: {
                    facts: compilerSourceCoverage,
                    plan: coverageSourcePlan,
                  },
                }
              : {}),
            signal,
          })
          for (const error of coverage.thresholdErrors) {
            ;(options.writeError ?? options.write)(error + '\n')
            coverageDiagnostic(error)
          }
          signal.throwIfAborted()
          prepared.commit()
          coverageHasPublished = true
          coverageAllTestsRun = false
          return coverage.thresholdErrors.length > 0
        }
        try {
          if (!selected.size && !coverageSourcePlan?.requests.length) {
            let status = projects.every(
              (project) => project.passWithNoTests === true
            )
              ? ('passed' as const)
              : ('failed' as const)
            const envelope = {
              version: 1 as const,
              runId: randomUUID(),
              timestamp: Date.now(),
            }
            onEvent({
              ...envelope,
              type: 'run-start',
              snapshotUpdateMode: discovery.snapshotUpdateMode,
            })
            onEvent({ ...envelope, type: 'run-end', status, durationMs: 0 })
            if (await publishCoverage([], status)) status = 'failed'
            hasRun = true
            releaseTerminal(status)
            publicationStarted = true
            await machine?.finish({ signal })
            latestStatus = status
            hasFailedRun ||= status === 'failed'
            completedResult = { status }
            return completedResult
          }
          await configuration?.setup(
            projects.filter((project) => project.entries.length)
          )
          signal.throwIfAborted()
          const rerun = hasRun
          hasRun = true
          const response = await runWatchProcess(
            {
              operation: 'run',
              projectDir,
              projects,
              ...(configuration?.compilerTransformNames.length
                ? {
                    compilerTransforms:
                      configuration.compilerTransforms(projects),
                  }
                : {}),
              testNamePattern: discovery.testNamePattern,
              maxWorkers: discovery.maxWorkers,
              ...(coverageConfig
                ? {
                    coverage: true,
                    standardCoverageOptions: coverageConfig,
                    watchCoverage: true,
                    coverageSourcePlan,
                    runtimeConfigurationPlan,
                    coverageInputs: configuration?.watchInputs,
                    includeUnimportedCoverage: includeUnimported,
                  }
                : {}),
              updateSnapshots: discovery.updateSnapshots,
              snapshotUpdateMode: discovery.snapshotUpdateMode,
              passWithNoTests: projects.every(
                (project) => project.passWithNoTests === true
              ),
            },
            {
              signal,
              async onRuntimeConfigurationInputs(files) {
                for (const request of runtimeConfigurationPlan!.requests) {
                  const file = request.authorization.configFile
                  if (file && files.includes(file))
                    verifiedActiveConfigurationFiles.add(file)
                }
              },
              onSnapshotCommitStart() {
                committingSnapshots = true
              },
              onSnapshotCommitEnd() {
                // Retain the guard through parent reporting and final release.
                // Native watcher notifications can arrive after the last write.
              },
              write: options.write,
              report: human,
              reporter: { ...options.reporter, rerun },
              onEvent,
            }
          )
          if (
            configuration &&
            (configuration.compilerTransformNames.length ||
              projects.some((project) => project.compilerAliases))
          ) {
            try {
              await watcher?.update({
                ...discovery.directories,
                dependencyFiles: configuration.watchInputs,
                directories: [
                  ...discovery.directories.directories,
                  ...configuration.watchInputs.map((file) => dirname(file)),
                ],
              })
            } catch (error) {
              fatal = true
              controller.abort(error)
              throw error
            }
          }
          if (response.operation !== 'run')
            throw new Error('Invalid watch execution result.')
          const result = response.result
          compilerSourceCoverage = result.compilerSourceCoverage ?? []
          runtimeConfigurationReceipts =
            result.runtimeConfigurationReceipts ?? []
          if (result.unsafeCleanup) fatal = true
          if (result.status === 'running') {
            throw new Error('Test run returned without a terminal result.')
          }
          signal.throwIfAborted()
          let coverageFailed = false
          if (response.standardCoverageUnavailable) {
            if (
              !coverageConfig ||
              result.status !== 'failed' ||
              result.standardCoverage !== undefined
            )
              throw new Error('Invalid parent watch coverage completion.')
          } else if (
            coverageConfig &&
            (result.status === 'passed' || result.status === 'failed')
          ) {
            if (result.unsafeCleanup)
              throw new Error(
                'Standard watch coverage requires clean execution.'
              )
            coverageFailed = await publishCoverage(
              result.standardCoverage,
              result.status
            )
          }
          releaseTerminal(coverageFailed ? 'failed' : result.status)
          publicationStarted = true
          await machine?.finish({ signal })
          for (const [entryId, status] of fileOutcomes) {
            if (status === 'failed') failedEntries.add(entryId)
            else if (status === 'passed') failedEntries.delete(entryId)
          }
          if (
            !signal.aborted &&
            !result.unsafeCleanup &&
            (result.status === 'passed' || result.status === 'failed')
          ) {
            latestStatus = coverageFailed ? 'failed' : result.status
            hasFailedRun ||= latestStatus === 'failed'
          }
          completedResult = {
            status: coverageFailed ? 'failed' : result.status,
            unsafeCleanup: result.unsafeCleanup,
          }
          return completedResult
        } catch (error) {
          if (signal.aborted && error === signal.reason) throw error
          let failure = error
          // A parent-sealed cleanup failure replaces the previous result too.
          // Superseded generations and incomplete evidence never publish.
          if (
            !publicationStarted &&
            terminalRun &&
            !reporterFailed &&
            !signal.aborted
          ) {
            try {
              coverageDiagnostic(
                error instanceof Error
                  ? error.message
                  : 'Watch generation failed before publication.'
              )
              releaseTerminal('failed')
              publicationStarted = true
              await machine?.finish({ signal })
            } catch (publicationError) {
              failure = new AggregateError(
                [error, publicationError],
                'Test execution and watch report publication failed.'
              )
            }
          }
          // Ordinary test/compile failures are results. Unexpected process exit
          // or reporter failure cannot certify output ownership for another run.
          fatal = true
          controller.abort(failure)
          try {
            report(failure)
          } catch (reporterError) {
            failures.push(failure, reporterError)
          }
          throw failure
        } finally {
          await machine?.dispose()
          running = false
          committingSnapshots = false
          if (keyboardCancelled && !controller.signal.aborted) {
            options.write('Test run cancelled. Watching for file changes...\n')
          }
          if (changedDuringCommit) {
            changedDuringCommit = false
            // Snapshot notifications must not cancel their completed writer.
            // Publish its closed result, then request a fresh complete run.
            if (
              completedResult &&
              !signal.aborted &&
              !completedResult.unsafeCleanup
            )
              completedResult.rerunAfterSettled = true
            else session?.invalidate()
          }
        }
      },
      onError: report,
    })
    await session.closed
    await session.waitForIdle()
  } catch (error) {
    if (!controller.signal.aborted || error !== controller.signal.reason)
      failures.push(error)
  } finally {
    try {
      keyboard?.close()
    } catch (error) {
      failures.push(error)
    }
    try {
      await watcher?.close()
    } catch (error) {
      failures.push(error)
    }
    try {
      await session?.close()
    } catch (error) {
      failures.push(error)
    } finally {
      try {
        await configuration?.dispose()
      } catch (error) {
        failures.push(error)
      }
      options.signal.removeEventListener('abort', cancel)
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length)
    throw new AggregateError(
      failures,
      'Test watch failed and cleanup did not complete successfully.'
    )
  return {
    status:
      fatal || (quitting && hasFailedRun)
        ? 'failed'
        : quitting
          ? latestStatus
          : 'cancelled',
  }
}
