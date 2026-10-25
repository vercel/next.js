import {
  createRuntimeConfigurationPlan,
  type RuntimeConfigurationReceipt,
} from './coverage/runtime-configuration'
import { createCoverageSourcePlan } from './coverage/source-analysis-plan'
import type { CompilerSourceCoverage } from './coverage/types'
import { createHash, randomUUID } from 'crypto'
import type { StandardCoverageOptions } from './coverage/types'
import { createStandardCoverageGenerationCache } from './coverage/generation-cache'
import {
  prepareStandardCoverageDirectory,
  publishStandardCoverage,
} from './coverage/report-standard'
import { resolveProjectStandardCoverage } from './coverage/options'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'path'
import { serialize } from 'node:v8'
import type { SnapshotUpdateMode } from './assertions/snapshots'
import {
  matchesRetainedSetupChange,
  snapshotWatchRegistry,
} from './incremental/registry-additions'
import { selectSourceRelatedProjects } from './incremental/source-selection'
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
  type WatchSessionOptions,
} from './incremental/watch-session'
import {
  watchTestFiles,
  type WatchDirectories,
} from './incremental/watch-files'
import { runWatchProcess, WatchOwnershipError } from './watch-process'
import type { ResultEvent } from './reporting/events'
import {
  createMachineReporter,
  type ClosedMachineFileRecord,
  type ResultReporter,
} from './reporting/machine'
import {
  isCustomResultReporter,
  openCustomReporters,
} from './reporting/custom-reporter'
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
  coverage: ReturnType<typeof resolveProjectStandardCoverage>
  customCoverageDisabled?: true
  coverageInputs: string[]
  coverageConfigurationRevision: string
}

/** Only actual regular-file notifications can narrow a default watch run. */
async function regularSourceIdentity(file: string) {
  if (!isAbsolute(file) || resolve(file) !== file) return
  try {
    const before = await lstat(file, { bigint: true })
    if (!before.isFile() || (await realpath(file)) !== file) return
    const after = await lstat(file, { bigint: true })
    if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino)
      return
    return { dev: after.dev, ino: after.ino }
  } catch (error) {
    if (
      ['ENOENT', 'ENOTDIR', 'ELOOP'].includes(
        (error as NodeJS.ErrnoException).code ?? ''
      )
    )
      return
    throw error
  }
}

/** Fresh compilation/execution per generation; the scheduler owns no output writer. */
export async function watchTests(
  projectDir: string,
  options: {
    input?: NodeJS.ReadStream
    output?: NodeJS.WriteStream
    project?: string
    files?: string[]
    related?: readonly string[]
    /** The Git changed union has a separate coverage-source filter contract. */
    initialRelatedFromChanged?: true
    testNamePattern?: string | RegExp
    maxWorkers?: number
    standardCoverageOptions?: StandardCoverageOptions
    /** Only original explicit coverage and coverage.* CLI fields. */
    coverageFlags?: Record<string, unknown>
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
    apiPort?: number
  }
): Promise<{ status: 'passed' | 'failed' | 'cancelled' }> {
  // Caller-owned option objects cannot alter a retained generation's source selection.
  const cliCoverageOptions = options.standardCoverageOptions
    ? structuredClone(options.standardCoverageOptions)
    : undefined
  const coverageFlags = structuredClone(
    options.coverageFlags ??
      (options.standardCoverageOptions ? { coverage: true } : {})
  )
  let activeDiscovery: Discovery | undefined
  let coverageConfigurationRevision: string | undefined
  const controller = new AbortController()
  const configurationLifetime = new AbortController()
  const cancel = () => controller.abort(options.signal.reason)
  if (options.signal.aborted) cancel()
  else options.signal.addEventListener('abort', cancel, { once: true })
  let selectedProject = options.project
  let selectedFiles = options.files
  const initialRelatedSources = options.related?.map((file) =>
    resolve(projectDir, file)
  )
  let initialRelatedPending = initialRelatedSources !== undefined
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
  let activeUserCancellation:
    | { controller: AbortController; activeCases: Set<string> }
    | undefined
  const closedFileHistory = new Map<string, ClosedMachineFileRecord>()
  let keyboard: ReturnType<typeof createWatchKeyboard> | undefined
  let fatal = false
  let hasRun = false
  let customReadyInitial: boolean | undefined
  let editorFileRerun: string | undefined
  let coverageHasPublished = false
  let coverageAllTestsRun = false
  let coverageCache = createStandardCoverageGenerationCache(projectDir)
  const failures: unknown[] = []
  let watcher: Awaited<ReturnType<typeof watchTestFiles>> | undefined
  let customReporters:
    | Awaited<ReturnType<typeof openCustomReporters>>
    | undefined
  let session: ReturnType<typeof createWatchSession<Discovery>> | undefined
  let editorApi:
    | Awaited<ReturnType<typeof import('./editor-api').openTestDiscoveryApi>>
    | undefined

  let configuration:
    | Awaited<ReturnType<typeof openTestConfiguration>>
    | undefined

  async function retainConfigurationForWatch(requireCurrent = false) {
    if (!configuration) return false
    if (
      await configuration.retainCompilerTransformsForWatch(
        controller.signal,
        requireCurrent
      )
    )
      return true
    return (
      !activeDiscovery?.coverage.options &&
      configuration.retainGlobalSetupForWatch(
        configurationLifetime.signal,
        applyTestConfigOverrides(
          configuration.config,
          options.configOverrides ?? {}
        ).projects,
        requireCurrent
      )
    )
  }

  async function discover(signal: AbortSignal): Promise<Discovery> {
    signal.throwIfAborted()
    if (!configuration || !(await retainConfigurationForWatch())) {
      await configuration?.dispose()
      configuration = undefined
      configuration =
        coverageFlags['coverage.provider'] === 'v8'
          ? await openTestConfiguration(projectDir, signal, 'v8')
          : await openTestConfiguration(projectDir, signal)
      await retainConfigurationForWatch(true)
    }
    const config = applyTestConfigOverrides(
      configuration.config,
      options.configOverrides ?? {}
    )
    const projects = await discoverTests(projectDir, config, {
      project: selectedProject,
      files: selectedFiles,
    })
    const coverage = resolveProjectStandardCoverage(
      projects,
      coverageFlags,
      cliCoverageOptions
    )
    if (coverage.options?.thresholds.autoUpdate)
      throw new Error('Watch coverage threshold autoUpdate is not implemented.')
    const customCoverageDisabled = coverageFlags.coverage === false
    if (
      !customCoverageDisabled &&
      projects.some((project) => project.customCoverage)
    )
      throw new Error(
        'Custom coverage watch requires an implemented provider lifecycle.'
      )
    if (
      coverage.configured &&
      coverage.enabled &&
      projects.some(
        (project) =>
          project.typecheck?.enabled ||
          project.isolate === false ||
          project.executionEnvironment ||
          project.profile.environment !== 'node' ||
          project.profile.route ||
          project.entries.some((entry) => entry.executionEnvironment)
      )
    )
      throw new Error(
        'Configured V8 coverage watch requires isolated ordinary Node execution.'
      )
    if (
      coverage.configured &&
      coverage.enabled &&
      options.initialRelatedFromChanged
    )
      throw new Error(
        'Configured V8 changed-watch coverage source filtering is not implemented.'
      )
    if (
      coverage.enabled &&
      coverage.options &&
      projects.some(
        (project) =>
          project.profile.environment === 'browser' &&
          project.profile.browserClient === true &&
          project.profile.mode === 'production'
      )
    )
      throw new Error(
        'Production Browser coverage currently requires one-shot JavaScript execution.'
      )
    const standardCoverageOptions = coverage.options
    const coverageInputs = configuration.compilerInputsForProjects(projects)
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
        ({ profile, browserFixtures }) =>
          (profile.mode !== 'development' &&
            !(
              profile.mode === 'production' &&
              (profile.environment === 'node' ||
                (profile.environment === 'browser' &&
                  (profile.browserClient === true ||
                    (browserFixtures?.length ?? 0) > 0)))
            )) ||
          profile.runtime !== 'nodejs' ||
          profile.bundler !== 'turbopack' ||
          profile.route !== undefined
      )
    ) {
      throw new Error(
        'Test watch supports route-less development profiles and production Browser client profiles, plus ordinary production Node profiles and registered production component drivers, with Turbopack Node.js only.'
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
    const configurationInputs = new Set([
      ...configurationSources,
      ...coverageInputs,
    ])
    // These inputs belong to configuration imports/closures, not the test graph.
    // A file keeps that role when it is also selected as a test or source.
    const coverageRevision = registry
      ? createHash('sha256')
          .update(
            serialize({
              coverage,
              customCoverageDisabled,
              inputs: registry.inputs
                .filter((input) => configurationInputs.has(input.file))
                .sort((left, right) =>
                  left.file < right.file ? -1 : left.file > right.file ? 1 : 0
                ),
            })
          )
          .digest('hex')
      : randomUUID()
    signal.throwIfAborted()
    const discovery: Discovery = {
      projects,
      registry,
      coverage,
      ...(customCoverageDisabled ? { customCoverageDisabled: true } : {}),
      coverageInputs,
      coverageConfigurationRevision: coverageRevision,
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
    activeDiscovery = discovery
    return discovery
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
    if (command.type !== 'cancel') editorFileRerun = undefined
    switch (command.type) {
      case 'cancel':
        keyboardCancelled = true
        if (activeUserCancellation?.activeCases.size)
          activeUserCancellation.controller.abort()
        else session?.cancelCurrent()
        return
      case 'update':
        if (activeDiscovery?.coverage.options) {
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
    const customReporterNames = options.resultReporters?.filter(
      isCustomResultReporter
    )
    if (customReporterNames?.length)
      customReporters = await openCustomReporters({
        projectDir,
        reporters: customReporterNames,
        watch: true,
        signal: controller.signal,
        write: options.writeReport ?? options.write,
        writeError: options.writeError,
      })
    if (options.apiPort !== undefined) {
      const { openTestDiscoveryApi } = await import('./editor-api.js')
      editorApi = await openTestDiscoveryApi(
        projectDir,
        initial.projects.flatMap((project) => project.entries),
        options.apiPort,
        {
          cancelRun: () => onCommand({ type: 'cancel' }),
          rerun: () => onCommand({ type: 'rerun' }),
          ...(!initial.coverage.options
            ? {
                rerunFile(entryId: string) {
                  if (activeDiscovery?.coverage.options)
                    throw new Error(
                      'Editor file reruns with coverage are not implemented.'
                    )
                  editorFileRerun = entryId
                  coverageAllTestsRun = false
                  failedOnly = false
                  session?.invalidate({ invalidateAll: true })
                },
              }
            : {}),
        }
      )
      ;(options.writeError ?? options.write)(
        'Next test discovery API: ' + editorApi.url + '\n'
      )
    }
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
            registryPaths:
              change.removed.length && !customReporters
                ? undefined
                : [...change.changed, ...change.removed],
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
    const publishInitialEmptySelection = (discovery: Discovery) =>
      (discovery.coverage.options
        ? discovery.coverage.configured
        : machineEnabled) &&
      initialRelatedPending &&
      initialRelatedSources !== undefined &&
      (discovery.customCoverageDisabled === true ||
        !discovery.projects.some((project) => project.customCoverage))
    const registryReporters = customReporters
    session = createWatchSession<Discovery>({
      signal: controller.signal,
      runEmpty: (discovery) => machineEnabled || !!discovery.coverage.options,
      publishInitialEmptySelection,
      ...(registryReporters
        ? {
            async onRegistryRemoved({
              discovery,
              files,
            }: {
              discovery: Discovery
              files: readonly string[]
            }) {
              if (
                discovery.coverage.options ||
                editorApi ||
                (discovery.customCoverageDisabled !== true &&
                  discovery.projects.some((project) => project.customCoverage))
              )
                return false
              try {
                await registryReporters.removeWatchTests([...files])
                return true
              } catch (error) {
                fatal = true
                controller.abort(error)
                try {
                  report(error)
                } catch (reporterError) {
                  failures.push(reporterError)
                }
                throw error
              }
            },
          }
        : {}),
      async selectTests({
        discovery,
        selection,
        changedPaths,
        invalidateAll,
        signal,
      }: Parameters<
        NonNullable<WatchSessionOptions<Discovery>['selectTests']>
      >[0]) {
        // Related paths constrain the initial settled generation only.
        // Later filesystem edits use their own actual compiler consumers.
        const sources =
          initialRelatedPending && initialRelatedSources
            ? [...initialRelatedSources, ...(changedPaths ?? [])]
            : !invalidateAll && changedPaths?.length
              ? changedPaths
              : undefined
        if (!sources) return undefined
        const defaultSelection = initialRelatedSources === undefined
        if (
          defaultSelection &&
          (selection.reason === 'test-registry-addition' ||
            discovery.coverage.options ||
            (discovery.customCoverageDisabled !== true &&
              discovery.projects.some((project) => project.customCoverage)))
        )
          return undefined
        const sourceIdentities = []
        if (defaultSelection) {
          for (const file of sources) {
            signal.throwIfAborted()
            const identity = await regularSourceIdentity(file)
            if (!identity) return undefined
            sourceIdentities.push({ file, ...identity })
          }
        }
        const result = await runWatchProcess(
          {
            operation: 'plan',
            projectDir,
            projects: discovery.projects,
            certifiedTestConfig:
              configuration?.watchInputs.every((file) =>
                file.endsWith('.json')
              ) ?? false,
          },
          { signal, write: options.write, reporter: options.reporter }
        ).catch((error) => {
          if (error instanceof WatchOwnershipError) {
            fatal = true
            controller.abort(error)
          }
          throw error
        })
        signal.throwIfAborted()
        if (result.operation !== 'plan')
          throw new Error('Invalid watch source selection plan.')
        for (const before of sourceIdentities) {
          const after = await regularSourceIdentity(before.file)
          signal.throwIfAborted()
          if (!after || after.dev !== before.dev || after.ino !== before.ino)
            return undefined
        }
        const selected = await selectSourceRelatedProjects(
          discovery.projects,
          sources,
          result.plan
        )
        signal.throwIfAborted()
        return {
          entryIds: selected.flatMap((project) =>
            project.entries.map((entry) => entry.id)
          ),
          reason: 'compiler-dependencies' as const,
        }
      },
      async canSkipUnchangedRun({
        discovery,
        previousRegistry,
        changedPaths,
        signal,
      }) {
        const owner = configuration
        if (
          discovery.coverage.options ||
          !owner ||
          !(await owner.retainGlobalSetupForWatch(
            configurationLifetime.signal,
            discovery.projects,
            false,
            true
          )) ||
          !matchesRetainedSetupChange({
            previous: previousRegistry,
            current: discovery.registry,
            changedPaths,
            setupFiles: discovery.projects.flatMap((project) =>
              (project.globalSetup ?? []).map((file) =>
                resolve(projectDir, file)
              )
            ),
          })
        )
          return false
        signal.throwIfAborted()
        try {
          const result = await runWatchProcess(
            {
              operation: 'plan',
              projectDir,
              projects: discovery.projects,
              certifiedTestConfig: owner.watchInputs.every((file) =>
                file.endsWith('.json')
              ),
              retainedGlobalSetup: true,
            },
            { signal, write: options.write, reporter: options.reporter }
          )
          signal.throwIfAborted()
          if (result.operation !== 'plan') return false
          const related = await selectSourceRelatedProjects(
            discovery.projects,
            changedPaths!,
            result.plan
          )
          if (related.some((project) => project.entries.length)) return false
          const registry = discovery.registry!
          const current = await snapshotWatchRegistry({
            configurationRevision: registry.configurationRevision,
            entries: registry.entries,
            inputs: registry.inputs.map((input) => input.file),
            signal,
          })
          signal.throwIfAborted()
          if (
            owner !== configuration ||
            current === undefined ||
            !serialize(current).equals(serialize(registry))
          )
            return false
          const retained = await owner.retainGlobalSetupForWatch(
            configurationLifetime.signal,
            discovery.projects,
            false,
            true
          )
          signal.throwIfAborted()
          return retained && owner === configuration
        } catch (error) {
          if (error instanceof WatchOwnershipError) {
            fatal = true
            controller.abort(error)
            throw error
          }
          signal.throwIfAborted()
          return false
        }
      },
      async onRunSettled(status, discovery, retainedCancellation) {
        if (
          status === 'passed' ||
          status === 'failed' ||
          (status === 'cancelled' &&
            retainedCancellation?.retainBaselineOnClosedCancellation === true)
        )
          initialRelatedPending = false
        const initialReadiness = customReadyInitial
        customReadyInitial = undefined
        if (initialReadiness !== undefined) {
          try {
            const error = await customReporters?.readyWatchRun(initialReadiness)
            if (error) {
              report(error)
              return
            }
          } catch (error) {
            fatal = true
            controller.abort(error)
            throw error
          }
        }
        if (status === 'cancelled') {
          options.write('Test run cancelled. Watching for file changes...\n')
          return
        }
        if (status !== 'passed' && status !== 'failed') return
        if (!discovery.entryIds.length) {
          options.write(
            `No test files matched. Watching for file changes.${keyboard?.enabled ? ' Press h for help.' : ''}\n`
          )
        }
        if (
          discovery.entryIds.length ||
          machineEnabled ||
          discovery.coverage.options
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
          if (updateThisRun && discovery.coverage.options)
            throw new Error(
              '--coverage cannot be combined with snapshot updates.'
            )
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
      async run({ discovery, selection, signal, changedPaths }) {
        running = true
        const requestedEditorFile = editorFileRerun
        editorFileRerun = undefined
        const coverageConfig = discovery.coverage.options
        const browserUserCancellation =
          !discovery.coverage.configured &&
          !coverageConfig &&
          discovery.projects.length > 0 &&
          discovery.projects.every(
            (project) =>
              project.profile.browserClient === true &&
              project.profile.environment === 'browser' &&
              project.isolate !== false &&
              project.profile.route === undefined &&
              project.executionEnvironment === undefined
          )
        const userCancellation =
          (browserUserCancellation ||
            (discovery.coverage.configured &&
              coverageConfig?.formatterReports)) &&
          !discovery.updateSnapshots &&
          (options.resultReporters ?? ['default']).every(
            (reporter) => reporter === 'default' || reporter === 'json'
          )
            ? new AbortController()
            : undefined
        const userCancellationOwner = userCancellation
          ? { controller: userCancellation, activeCases: new Set<string>() }
          : undefined
        activeUserCancellation = userCancellationOwner
        let orderlyCancellation:
          | { launchedEntryIds: string[]; notExecutedEntryIds: string[] }
          | undefined
        const configurationRestarted =
          coverageConfigurationRevision !==
          discovery.coverageConfigurationRevision
        if (configurationRestarted) {
          closedFileHistory.clear()
          coverageCache = createStandardCoverageGenerationCache(projectDir)
          coverageHasPublished = false
          coverageAllTestsRun = true
          coverageConfigurationRevision =
            discovery.coverageConfigurationRevision
        }
        if (
          coverageConfig?.formatterReports &&
          (configurationRestarted
            ? coverageConfig.clean !== false
            : coverageConfig.cleanOnRerun !== false)
        )
          await prepareStandardCoverageDirectory(
            projectDir,
            coverageConfig,
            signal
          )
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
        if (requestedEditorFile !== undefined) {
          for (const entryId of selected) {
            if (entryId !== requestedEditorFile) selected.delete(entryId)
          }
        }
        const missingEditorFile =
          requestedEditorFile !== undefined &&
          !selected.has(requestedEditorFile)
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
        const initialEmptySelection =
          publishInitialEmptySelection(discovery) &&
          discovery.entryIds.length > 0 &&
          selection.entryIds.length === 0
        editorApi?.prepareRun(
          discovery.projects.flatMap((project) => project.entries)
        )
        const coverageSourcePlan = coverageConfig
          ? await createCoverageSourcePlan({
              projectDir,
              projects: discovery.projects,
              config: coverageConfig,
              inputs: discovery.coverageInputs,
              includeUnimported,
              signal,
            })
          : undefined
        const runtimeConfigurationPlan = coverageConfig
          ? await createRuntimeConfigurationPlan({
              projectDir,
              projects,
              inputs: discovery.coverageInputs,
              signal,
            })
          : undefined
        let runtimeConfigurationReceipts: RuntimeConfigurationReceipt[] = []
        let compilerSourceCoverage: CompilerSourceCoverage[] = []
        const machine = machineEnabled
          ? createMachineReporter({
              projectDir,
              ...(customReporters
                ? { customReporterSession: customReporters }
                : {}),
              reporters: options.resultReporters!,
              outputFile: options.outputFile,
              ...(initialEmptySelection
                ? {
                    emptySelectionPassWithNoTests:
                      !!coverageConfig ||
                      projects.every(
                        (project) => project.passWithNoTests !== false
                      ),
                  }
                : {}),
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
            if (
              userCancellationOwner &&
              (event.type === 'case-start' || event.type === 'case-end')
            ) {
              const key = JSON.stringify([
                event.entryId,
                event.caseId,
                event.attempt,
              ])
              if (event.type === 'case-start')
                userCancellationOwner.activeCases.add(key)
              else userCancellationOwner.activeCases.delete(key)
            }
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
            editorApi?.onEvent(event)
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
            expected: orderlyCancellation
              ? new Set(orderlyCancellation.launchedEntryIds)
              : selected,
            ...(orderlyCancellation
              ? {
                  notExecutedEntryIds: new Set(
                    orderlyCancellation.notExecutedEntryIds
                  ),
                }
              : {}),
            revisions: coverageRevisions,
            registry: discovery.registry,
            retentionConfigurationRevision:
              discovery.coverageConfigurationRevision,
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
              retainedEntryIds: prepared.retainedEntryIds,
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
          if (coverage.textSummary)
            (coverageConfig.formatterReports
              ? (options.writeReport ?? options.write)
              : options.write)(coverage.textSummary)
          for (const error of coverage.thresholdErrors) {
            ;(options.writeError ?? options.write)(error + '\n')
            coverageDiagnostic(error)
          }
          signal.throwIfAborted()
          prepared.commit()
          // Initial related zero maps do not consume the first actual test run.
          if (!orderlyCancellation) {
            coverageHasPublished = !initialEmptySelection
            coverageAllTestsRun = false
          }
          return coverage.thresholdErrors.length > 0
        }
        try {
          customReadyInitial = undefined
          const initialCustomRun = !hasRun
          await customReporters?.beginWatchRun(
            hasRun
              ? {
                  rerun: {
                    files: [
                      ...new Set(
                        projects.flatMap((project) =>
                          project.entries.map((entry) => entry.file)
                        )
                      ),
                    ],
                    ...(changedPaths?.length
                      ? {
                          trigger: relative(
                            projectDir,
                            changedPaths[changedPaths.length - 1]
                          ),
                        }
                      : {}),
                  },
                }
              : undefined
          )
          await machine?.initialize({ signal })
          if (
            missingEditorFile ||
            (!selected.size && !coverageSourcePlan?.requests.length)
          ) {
            if (missingEditorFile)
              options.write(
                'Requested editor file is no longer discoverable.\n'
              )
            let status =
              !missingEditorFile &&
              (initialEmptySelection ||
                projects.every((project) => project.passWithNoTests === true))
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
            if (customReporters) customReadyInitial = initialCustomRun
            latestStatus = status
            hasFailedRun ||= status === 'failed'
            completedResult = { status }
            return completedResult
          }
          await configuration?.setup(
            projects.filter((project) => project.entries.length),
            signal
          )
          signal.throwIfAborted()
          const rerun = hasRun
          hasRun = true
          const response = await runWatchProcess(
            {
              operation: 'run',
              ...(discovery.customCoverageDisabled
                ? { customCoverageDisabled: true }
                : {}),
              captureTaskResults:
                (browserUserCancellation && !!userCancellation) ||
                machine?.captureTaskResults,
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
                    coverageInputs: discovery.coverageInputs,
                    includeUnimportedCoverage: includeUnimported,
                  }
                : {}),
              updateSnapshots: discovery.updateSnapshots,
              snapshotUpdateMode: discovery.snapshotUpdateMode,
              passWithNoTests: projects.every((project) =>
                initialEmptySelection
                  ? !!coverageConfig || project.passWithNoTests !== false
                  : project.passWithNoTests === true
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
              ...(userCancellation
                ? { userCancelSignal: userCancellation.signal }
                : {}),
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
          orderlyCancellation = response.orderlyCancellation
          if (orderlyCancellation && !userCancellation?.signal.aborted)
            throw new Error('Unrequested orderly watch cancellation.')
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
          if (orderlyCancellation && machine) {
            const launched = new Set(orderlyCancellation.launchedEntryIds)
            const unexecuted = discovery.projects
              .flatMap((project) => project.entries)
              .filter((entry) => !launched.has(entry.id))
            const unexecutedIds = new Set(unexecuted.map((entry) => entry.id))
            machine.retainUnexecutedFiles(
              unexecuted,
              [...closedFileHistory.values()].filter((record) =>
                unexecutedIds.has(record.result.entry.entry.id)
              ),
              [...closedFileHistory.keys()]
                .filter(
                  (id) => !selected.has(id) && discovery.entryIds.includes(id)
                )
                .concat([...selected])
            )
          }
          releaseTerminal(coverageFailed ? 'failed' : result.status)
          publicationStarted = true
          await machine?.finish({ signal })
          if (customReporters) customReadyInitial = initialCustomRun
          const closed =
            machine?.snapshotClosedFiles(
              orderlyCancellation
                ? new Set(orderlyCancellation.launchedEntryIds)
                : new Set(coverageRevisions.keys())
            ) ?? []
          const currentRecords = new Map(
            closed.map((record) => [record.result.entry.entry.id, record])
          )
          const previousRecords = new Map(closedFileHistory)
          for (const id of closedFileHistory.keys())
            if (selected.has(id) || !discovery.entryIds.includes(id))
              closedFileHistory.delete(id)
          for (const id of selected) {
            const record = currentRecords.get(id) ?? previousRecords.get(id)
            if (record) closedFileHistory.set(id, record)
          }
          for (const [entryId, status] of orderlyCancellation
            ? []
            : fileOutcomes) {
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
          if (orderlyCancellation) hasFailedRun = true
          const cancelledBrowserEntries = orderlyCancellation?.launchedEntryIds
          completedResult = {
            status: orderlyCancellation
              ? 'cancelled'
              : coverageFailed
                ? 'failed'
                : result.status,
            ...(orderlyCancellation
              ? { closedUserCancellation: true as const }
              : {}),
            ...(browserUserCancellation &&
            orderlyCancellation &&
            result.status === 'passed' &&
            orderlyCancellation.notExecutedEntryIds.length === 0 &&
            discovery.entryIds.length > 0 &&
            selected.size === discovery.entryIds.length &&
            cancelledBrowserEntries?.length === discovery.entryIds.length &&
            discovery.entryIds.every((id) =>
              cancelledBrowserEntries.includes(id)
            )
              ? { retainBaselineOnClosedCancellation: true as const }
              : {}),
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
          if (signal.aborted || orderlyCancellation)
            editorApi?.cancelledRunSettled()
          if (activeUserCancellation === userCancellationOwner)
            activeUserCancellation = undefined
          running = false
          committingSnapshots = false
          if (
            keyboardCancelled &&
            !controller.signal.aborted &&
            !orderlyCancellation
          ) {
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
        await editorApi?.dispose()
      } catch (error) {
        failures.push(error)
      }
      try {
        await configuration?.dispose()
      } catch (error) {
        failures.push(error)
      } finally {
        configurationLifetime.abort()
      }
      try {
        await customReporters?.dispose()
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
