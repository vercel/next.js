import { supportsCustomCoverageMode } from '../experimental/testing/coverage/custom-options'
import { isSharedRscWatchRun } from '../experimental/testing/incremental/shared-rsc-cohort'
import type {
  TestResultCache,
  TestResultCacheUpdate,
} from '../experimental/testing/result-cache'
import type {
  RuntimeConfigurationPlan,
  RuntimeConfigurationReceipt,
} from '../experimental/testing/coverage/runtime-configuration'
import type { CoverageSourcePlan } from '../experimental/testing/coverage/source-analysis-plan'
import { canUpdateMultipleRootProjectThresholds } from '../experimental/testing/coverage/threshold-format'
import type { PreparedCoverageMap } from '../experimental/testing/coverage/report-standard'
import {
  isProductionBrowserCoverageProject,
  isDevelopmentBrowserCoverageProject,
  isDevelopmentBrowserWatchCoverageProject,
} from '../experimental/testing/coverage/production-browser'
import {
  openCustomCoverageSession,
  type CustomCoverageSession,
} from '../experimental/testing/coverage/custom-session'
import { assertCustomCoverageFacts } from '../experimental/testing/coverage/custom-facts'
import type {
  CustomCoverageFact,
  CustomCoverageRequest,
  CustomCoverageResult,
} from '../experimental/testing/coverage/custom-types'
import { realpath } from 'fs/promises'
import type { TestProcessExit } from '../experimental/testing/execution/process'
import type { PreparedConfigFinalExit } from '../experimental/testing/config-final-exit'
import {
  parseStandardCoverageOptions,
  resolveProjectStandardCoverage,
} from '../experimental/testing/coverage/options'
import type {
  CompilerSourceCoverage,
  StandardCoverageOptions,
  StandardFileCoverage,
} from '../experimental/testing/coverage/types'
import {
  createMachineReporter,
  parseResultReporters,
  mergeResultReports,
  isMachineResultReporter,
  isCustomResultReporter,
} from '../experimental/testing/reporting/machine'
import path from 'path'
import type { ResultOutputFile } from '../experimental/testing/reporting/options'
import {
  applyTestConfigOverrides,
  openTestConfiguration,
  type TestConfigOverrides,
} from '../experimental/testing/config'
import { discoverTests } from '../experimental/testing/discovery'
import { configDefaults } from '../experimental/testing/config-api'
import {
  parseTestInspectAddress,
  parseConfiguredTestInspectAddress,
  parseTestInspectBrkAddress,
} from '../experimental/testing/execution/inspector'
import {
  acquireTestRunLock,
  parseMaxWorkers,
  resolveTestMaxWorkers,
  parseTestShard,
  shardTestProjects,
  sortUncachedTestProjects,
  sortCachedTestProjects,
} from '../experimental/testing/scheduling'
import { shuffle, shuffleFiles } from '../experimental/testing/runner/sequence'
import { createTestTerminal } from '../experimental/testing/reporting/terminal'
import {
  requireTestCapability,
  testCapabilities,
} from '../experimental/testing/capabilities'

export interface NextTestRunnerOptions {
  /** Internal CLI receipt; removed before execution options cross any boundary. */
  onFinalProcessExit?: (result: TestProcessExit) => void
  list?: boolean
  json?: boolean
  staticParse?: boolean | string
  run?: boolean
  watch?: boolean
  update?: boolean
  capabilities?: boolean
  api?: true | string
  coverage?: boolean
  typecheck?: boolean
  'typecheck.only'?: boolean
  'typecheck.spawnTimeout'?: string | number | boolean
  'coverage.reporter'?: string[]
  'coverage.provider'?: string
  'coverage.include'?: string[]
  'coverage.exclude'?: string[]
  'coverage.reportsDirectory'?: string
  'coverage.reportOnFailure'?: boolean | string
  'coverage.cleanOnRerun'?: boolean | string
  'coverage.thresholds.100'?: boolean | string
  'coverage.thresholds.statements'?: string
  'coverage.thresholds.functions'?: string
  'coverage.thresholds.branches'?: string
  'coverage.thresholds.lines'?: string
  'coverage.thresholds.autoUpdate'?: boolean | string
  inspect?: string | boolean
  inspectBrk?: string | boolean
  fileParallelism?: boolean
  cache?: boolean
  /** Actual parser default, distinct from an explicit CLI cache override. */
  cacheDefault?: boolean
  'browser.headless'?: boolean | string
  includeTaskLocation?: boolean | string
  project?: string
  filter?: string[]
  related?: string[]
  changed?: true | string
  testNamePattern?: string
  maxWorkers?: string
  shard?: string
  reporter?: string[]
  outputFile?: string
  mergeReports?: string
  retry?: string
  bail?: string
  testTimeout?: string
  hookTimeout?: string
  allowOnly?: boolean
  passWithNoTests?: boolean
}

function executionOverrides(
  options: NextTestRunnerOptions
): TestConfigOverrides {
  const overrides: TestConfigOverrides = {
    allowOnly: options.allowOnly,
    passWithNoTests:
      options.passWithNoTests ?? (options.related ? true : undefined),
  }
  const typecheck: NonNullable<TestConfigOverrides['typecheck']> = {}
  if (options.typecheck !== undefined) typecheck.enabled = options.typecheck
  if (options['typecheck.only'] !== undefined) {
    typecheck.only = options['typecheck.only']
    typecheck.enabled ??= true
  }
  if (options['typecheck.spawnTimeout'] !== undefined) {
    // The public option is numeric; authored CLI values use native timer coercion.
    typecheck.spawnTimeout = options['typecheck.spawnTimeout'] as number
  }
  if (Object.keys(typecheck).length) overrides.typecheck = typecheck
  const headless = options['browser.headless']
  if (headless !== undefined) {
    if (
      headless !== true &&
      headless !== false &&
      headless !== 'true' &&
      headless !== 'false'
    )
      throw new Error('--browser.headless must be true or false.')
    overrides.browserHeadless = headless === true || headless === 'true'
  }
  const includeTaskLocation = options.includeTaskLocation
  if (includeTaskLocation !== undefined) {
    if (
      includeTaskLocation !== true &&
      includeTaskLocation !== false &&
      includeTaskLocation !== 'true' &&
      includeTaskLocation !== 'false'
    )
      throw new Error('--includeTaskLocation must be true or false.')
    overrides.includeTaskLocation =
      includeTaskLocation === true || includeTaskLocation === 'true'
  }
  for (const key of ['retry', 'bail', 'testTimeout', 'hookTimeout'] as const) {
    const value = options[key]
    if (value === undefined) continue
    const number = /^\d+$/.test(value) ? Number(value) : NaN
    if (!Number.isSafeInteger(number) || number < 0 || number > 2 ** 31 - 1)
      throw new Error(
        `--${key} must be a nonnegative integer no greater than 2147483647.`
      )
    overrides[key] = number
  }
  return overrides
}

function validateUncachedMode(options: NextTestRunnerOptions) {
  if (
    options.cache === false &&
    (options.watch ||
      options.list ||
      options.capabilities ||
      options.mergeReports)
  )
    throw new Error('--no-cache currently requires one-shot test execution.')
}

export async function nextTestRunner(
  directory: string | undefined,
  options: NextTestRunnerOptions
): Promise<void> {
  const { onFinalProcessExit, ...executionOptions } = options
  options = executionOptions
  const coverageFlags = structuredClone(
    Object.fromEntries(
      Object.entries(options).filter(
        ([key]) => key === 'coverage' || key.startsWith('coverage.')
      )
    )
  )
  let standardCoverageOptions = parseStandardCoverageOptions(
    options as unknown as Record<string, unknown>
  )
  if (options.coverage === false) standardCoverageOptions = undefined
  const cliStandardCoverageOptions = standardCoverageOptions
  const breakAddress = parseTestInspectBrkAddress(options.inspectBrk)
  const inspectBrk = breakAddress !== undefined
  let inspect = inspectBrk
    ? (parseTestInspectBrkAddress(options.inspect) ?? breakAddress)
    : parseTestInspectAddress(options.inspect)
  const isTTY =
    process.stdout.isTTY === true &&
    !process.env.CI &&
    process.env.TERM !== 'dumb'
  // Explicit one-shot execution wins even when --watch is also supplied.
  if (options.run && options.watch) options = { ...options, watch: false }
  const explicitWatch = options.watch
  if (
    inspect &&
    (options.list || options.watch || options.coverage || options.mergeReports)
  )
    throw new Error(
      '--inspect currently requires a one-shot execution without coverage.'
    )
  validateUncachedMode(options)
  const overrides = executionOverrides(options)
  const hasExecutionOverrides = Object.values(overrides).some(
    (value) => value !== undefined
  )
  if (options.capabilities) {
    if (
      options.list ||
      options.json ||
      options.staticParse !== undefined ||
      options.run ||
      options.watch ||
      options.update ||
      options.coverage ||
      inspect !== undefined ||
      options.fileParallelism !== undefined ||
      options.maxWorkers !== undefined ||
      options.shard !== undefined ||
      options.api !== undefined ||
      options.related !== undefined ||
      options.changed !== undefined ||
      options.testNamePattern !== undefined ||
      options.reporter !== undefined ||
      options.outputFile !== undefined ||
      options.mergeReports !== undefined ||
      hasExecutionOverrides
    ) {
      throw new Error(
        '--capabilities cannot be combined with execution or listing options.'
      )
    }
    console.log(JSON.stringify(testCapabilities, null, 2))
    return
  }
  if ((options.related || options.changed) && options.list)
    throw new Error(
      '--related and --changed currently require a one-shot execution.'
    )
  if (options.api !== undefined && (options.list || options.mergeReports))
    throw new Error('--api cannot be combined with listing or report merging.')
  if (options.json && !options.list)
    throw new Error('--json requires --list for collected test names.')
  if (options.staticParse !== undefined && !(options.list && options.json))
    throw new Error('--staticParse requires --list --json.')
  if (options.coverage && options.update) {
    throw new Error('--coverage cannot be combined with --update.')
  }
  if (options.coverage && options.list) {
    throw new Error('--coverage cannot be combined with --list.')
  }
  if (options.coverage) requireTestCapability('coverage')
  if (options.watch && (options.run || options.list || options.update)) {
    throw new Error(
      '--watch cannot be combined with --run, --list, or --update.'
    )
  }
  if (options.list && options.update) {
    throw new Error('--update cannot be combined with --list.')
  }
  if (options.watch) requireTestCapability('watch')
  if (options.update) requireTestCapability('snapshotUpdate')
  if (options.list && !options.json && options.testNamePattern !== undefined) {
    throw new Error(
      '--list currently lists files only; testNamePattern requires test collection.'
    )
  }
  if (options.testNamePattern !== undefined) {
    try {
      new RegExp(options.testNamePattern)
    } catch {
      throw new Error(
        'Invalid testNamePattern: expected a valid regular expression.'
      )
    }
  }
  let reporters = parseResultReporters(options.reporter)
  function validateReporting(outputFile: ResultOutputFile | undefined) {
    if (options.list && reporters.some((name) => name !== 'default')) {
      throw new Error('Machine collection reports remain unimplemented.')
    }
    if (outputFile && !reporters.some(isMachineResultReporter)) {
      throw new Error('--outputFile requires a machine reporter.')
    }
    if (
      typeof outputFile === 'string' &&
      outputFile &&
      reporters.filter(isMachineResultReporter).length !== 1
    ) {
      throw new Error('--outputFile requires exactly one machine reporter.')
    }
  }
  if (options.mergeReports !== undefined || options.reporter !== undefined)
    validateReporting(options.outputFile)
  const projectDir = await realpath(path.resolve(directory ?? '.'))
  if (options.mergeReports !== undefined) {
    if (
      options.watch ||
      options.list ||
      options.update ||
      options.coverage ||
      options.project ||
      options.filter ||
      options.testNamePattern ||
      options.maxWorkers ||
      options.shard ||
      options.related ||
      options.changed ||
      options.api !== undefined ||
      hasExecutionOverrides
    ) {
      throw new Error(
        '--merge-reports cannot be combined with test execution or selection options.'
      )
    }
    const status = await mergeResultReports(options.mergeReports, {
      projectDir,
      reporters,
      outputFile: options.outputFile,
    })
    process.exitCode =
      status === 'passed' ? 0 : status === 'cancelled' ? 130 : 1
    return
  }
  let discoveryApi:
    | Awaited<
        ReturnType<
          typeof import('../experimental/testing/editor-api').openTestDiscoveryApi
        >
      >
    | undefined
  const apiPort =
    options.api === undefined
      ? undefined
      : (
          await import('../experimental/testing/editor-api.js')
        ).parseEditorApiPort(options.api)
  const customSessions = new Map<string, CustomCoverageSession>()
  const projectsForCustomCoverage = new Map<string, string[]>()
  let pendingCustomCoverage:
    | {
        facts: CustomCoverageFact[]
        status: 'passed' | 'failed'
        allTestsRun: boolean
      }
    | undefined
  let customExecutionStarted = false
  let customWritersClosed = false
  let finalExitLifecycleEligible = false
  let preparedFinalExit: PreparedConfigFinalExit | undefined
  // A boolean preserves failures which throw undefined, false or zero. Once
  // close has selected its actual status, only later cleanup may select again.
  let pendingFinalFailure = false
  let cleanedExecution = false
  let runLock: Awaited<ReturnType<typeof acquireTestRunLock>> | undefined
  let resultCache: TestResultCache | undefined
  let pendingCacheUpdates: TestResultCacheUpdate[] | undefined
  let cacheStartTime: number | undefined
  let resultCompletionError: unknown
  let deferredResultReporterDisposal: (() => Promise<void>) | undefined
  let pendingCoverage:
    | Omit<
        Parameters<
          typeof import('../experimental/testing/coverage/report-istanbul').publishIstanbulCoverage
        >[0],
        'projectDir' | 'signal'
      >
    | {
        facts: StandardFileCoverage[]
        runtimeConfiguration: {
          receipts: RuntimeConfigurationReceipt[]
          plan: RuntimeConfigurationPlan
        }
        sourceAnalysis: {
          facts: CompilerSourceCoverage[]
          plan: CoverageSourcePlan
        }
        expected: Set<string>
        excludedFiles: string[]
        config: StandardCoverageOptions
        status: 'passed' | 'failed' | 'cancelled'
      }
    | undefined
  const controller = new AbortController()
  let oneShotExecutionActive = false
  let interruptedExecutionJson = false
  let standardCoverageSignalExit = false
  let sigintReason: Error | undefined
  async function publishPendingCoverage(
    publicationOptions: {
      prepareOnly?: true
      onCoverageMap?: (map: PreparedCoverageMap) => void | Promise<void>
    } = {}
  ) {
    if (!pendingCoverage)
      throw new Error('No completed standard coverage request is available.')
    if ('plan' in pendingCoverage)
      return (
        await import('../experimental/testing/coverage/report-istanbul.js')
      ).publishIstanbulCoverage({
        projectDir,
        ...pendingCoverage,
        signal: controller.signal,
        ...publicationOptions,
      })
    return (
      await import('../experimental/testing/coverage/report-standard.js')
    ).publishStandardCoverage({
      projectDir,
      ...pendingCoverage,
      signal: controller.signal,
      ...publicationOptions,
    })
  }
  const cancel = () => controller.abort(new Error('Test run interrupted.'))
  const interrupt = () => {
    if (oneShotExecutionActive && !controller.signal.aborted)
      interruptedExecutionJson = true
    if (!standardCoverageSignalExit) return cancel()
    if (controller.signal.aborted) return
    sigintReason = new Error('Test run interrupted.')
    controller.abort(sigintReason)
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', cancel)
  let configuration:
    | Awaited<ReturnType<typeof openTestConfiguration>>
    | undefined
  try {
    configuration =
      options['coverage.provider'] === 'v8' ||
      options['coverage.provider'] === 'istanbul'
        ? await openTestConfiguration(
            projectDir,
            controller.signal,
            options['coverage.provider']
          )
        : await openTestConfiguration(projectDir, controller.signal)
    const configuredInspect =
      options.inspect === undefined
        ? parseConfiguredTestInspectAddress(configuration.config.inspect)
        : undefined
    if (configuredInspect !== undefined) inspect = configuredInspect
    if (inspect && (options.list || options.coverage || options.mergeReports))
      throw new Error(
        '--inspect currently requires a one-shot execution without coverage.'
      )
    const configuredWatch = options.watch ?? configuration.config.watch
    if (
      options.watch === undefined &&
      !options.run &&
      !options.list &&
      !options.update &&
      !options.capabilities &&
      !options.mergeReports
    ) {
      if (configuredWatch !== undefined) {
        options = { ...options, watch: configuredWatch }
      } else if (
        !options.related &&
        !options.changed &&
        options.api === undefined &&
        configDefaults.watch &&
        !options.coverage &&
        !options.typecheck &&
        !options['typecheck.only'] &&
        !inspect
      ) {
        options = { ...options, watch: true }
      }
    }
    if (options.watch) {
      if (explicitWatch !== true) requireTestCapability('watch')
      if (inspect)
        throw new Error(
          '--inspect currently requires a one-shot execution without coverage.'
        )
    }
    reporters = parseResultReporters(
      options.reporter ?? configuration.config.reporters
    )
    const outputFile = options.outputFile ?? configuration.config.outputFile
    validateReporting(outputFile)
    const authoredCache = configuration.config.cache
    const selectedCache =
      options.cache ??
      (authoredCache === undefined ? undefined : authoredCache !== false) ??
      options.cacheDefault
    if (options.cache === undefined && typeof authoredCache === 'object') {
      console.error(
        ` DEPRECATED  "cache.dir" is deprecated and has no effect. Use Vite's "cacheDir" instead if you want to change the cache directory. Note that the cache is written to "cacheDir/vitest".`
      )
    }
    options = { ...options, cache: selectedCache }
    validateUncachedMode(options)
    const parsedConfig = applyTestConfigOverrides(
      configuration.config,
      overrides
    )
    const config =
      options.changed && !options.related
        ? {
            ...parsedConfig,
            projects: parsedConfig.projects.map((project) =>
              project.passWithNoTests === undefined
                ? { ...project, passWithNoTests: true }
                : project
            ),
          }
        : parsedConfig
    if (
      configuredInspect !== undefined &&
      (config.projects.length !== 1 ||
        config.projects.some(
          (project) =>
            project.isolate === false ||
            project.profile.environment !== 'node' ||
            project.profile.route !== undefined ||
            project.executionEnvironment !== undefined
        ))
    )
      throw new Error(
        'Configured inspect currently requires one isolated ordinary Node project without routes or custom environments.'
      )
    if (
      config.projects.some((project) => project.typecheck?.enabled) &&
      (options.watch || options.list || inspect || options.coverage)
    ) {
      throw new Error(
        'Type-test checking currently requires a one-shot execution without --watch, --list, --inspect, or --coverage.'
      )
    }
    const maxWorkers = resolveTestMaxWorkers(config, options)
    if (inspect && maxWorkers !== 1)
      throw new Error(
        '--inspect requires --no-file-parallelism or --max-workers=1.'
      )
    const shard =
      options.shard === undefined ? undefined : parseTestShard(options.shard)
    if (options.watch && shard) {
      throw new Error(
        'Sharding requires a one-shot run; watch sharding is unsupported.'
      )
    }
    let projects = await discoverTests(projectDir, config, {
      project: options.project,
      files: options.filter,
    })
    if (
      configuredInspect !== undefined &&
      projects.some((project) =>
        project.entries.some(
          (entry) => entry.executionEnvironment !== undefined
        )
      )
    )
      throw new Error(
        'Configured inspect currently requires one isolated ordinary Node project without routes or custom environments.'
      )
    const configuredCoverage = resolveProjectStandardCoverage(
      projects,
      coverageFlags,
      standardCoverageOptions
    )
    if (
      configuredCoverage.options?.thresholds.autoUpdate &&
      (options.watch ||
        (projects.length !== 1 &&
          !canUpdateMultipleRootProjectThresholds(
            projects,
            configuration?.prepareCoverageThresholdUpdate
          )))
    )
      throw new Error(
        'Coverage threshold autoUpdate currently requires one one-shot project.'
      )
    const productionBrowserCoverage =
      !options.watch &&
      projects.length === 1 &&
      isProductionBrowserCoverageProject(projects[0])
    const developmentBrowserCoverage =
      !options.watch &&
      projects.length === 1 &&
      isDevelopmentBrowserCoverageProject(projects[0])
    const developmentBrowserWatchCoverage =
      options.watch &&
      projects.length === 1 &&
      isDevelopmentBrowserWatchCoverageProject(projects[0]) &&
      configuredCoverage.options !== undefined &&
      configuredCoverage.options.provider === undefined
    if (
      options.watch &&
      configuredCoverage.enabled &&
      configuredCoverage.options &&
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
    if (
      configuredCoverage.configured ||
      cliStandardCoverageOptions !== undefined
    ) {
      options = { ...options, coverage: configuredCoverage.enabled }
      standardCoverageOptions = configuredCoverage.options
      if (standardCoverageOptions?.provider === 'istanbul' && options.watch)
        throw new Error('Istanbul coverage watch is not implemented.')
      if (
        !options.watch &&
        !configuredCoverage.configured &&
        standardCoverageOptions
      )
        standardCoverageOptions = {
          ...standardCoverageOptions,
          clean: standardCoverageOptions.clean ?? true,
        }
      if (configuredCoverage.enabled) {
        if (
          options.list ||
          inspect ||
          options.update ||
          projects.some(
            (project) =>
              project.typecheck?.enabled ||
              project.isolate === false ||
              project.executionEnvironment ||
              (project.profile.environment !== 'node' &&
                !productionBrowserCoverage &&
                !developmentBrowserCoverage &&
                !developmentBrowserWatchCoverage) ||
              project.profile.route ||
              project.entries.some((entry) => entry.executionEnvironment)
          )
        )
          throw new Error(
            'Configured V8 coverage currently requires isolated Node execution without DOM, type tests, debugging or snapshot updates.'
          )
        requireTestCapability('coverage')
      }
    }
    if (options.coverage && options.watch && !standardCoverageOptions)
      throw new Error(
        'Watch coverage requires explicit standard coverage options.'
      )
    if ((options.related || options.changed) && !options.watch) {
      const { findChangedTestSources, selectSourceRelatedProjects } =
        await import('../experimental/testing/incremental/source-selection.js')
      const related = options.related
        ? options.related.map((file) => path.resolve(projectDir, file))
        : await findChangedTestSources(projectDir, options.changed!)
      if (!related.length)
        projects = projects.map((project) => ({ ...project, entries: [] }))
      else {
        const { runWatchProcess } = await import(
          '../experimental/testing/watch-process.js'
        )
        const result = await runWatchProcess(
          {
            operation: 'plan',
            projectDir,
            projects,
            certifiedTestConfig: configuration.watchInputs.every((file) =>
              file.endsWith('.json')
            ),
          },
          {
            signal: controller.signal,
            write: (text) => process.stderr.write(text),
          }
        )
        if (result.operation !== 'plan')
          throw new Error('Invalid test dependency planner response')
        projects = await selectSourceRelatedProjects(
          projects,
          related,
          result.plan
        )
      }
    }
    if (
      !options.related &&
      !options.changed &&
      !projects.some((project) => project.entries.length) &&
      !options.watch &&
      options.list &&
      !options.json &&
      !projects.every((project) => project.passWithNoTests === true)
    ) {
      throw new Error(
        'No test files matched the selected projects and filters.'
      )
    }
    let specificationOrder = projects.flatMap((project) =>
      project.entries.map((entry) => entry.id)
    )
    if (shard) {
      const fileCount = projects.reduce(
        (total, project) => total + project.entries.length,
        0
      )
      if (
        shard.count > fileCount &&
        !projects.every((project) => project.passWithNoTests === true)
      ) {
        throw new Error(
          `--shard count must not exceed the number of test files. Resolved ${fileCount} test files for --shard=${shard.index}/${shard.count}; use --passWithNoTests to permit empty assignments.`
        )
      }
      projects = await shardTestProjects(
        projects,
        shard,
        projectDir,
        options.cache === false ? { sortFiles: false } : undefined
      )
    }
    if (options.cache === false) {
      if (projects.length !== 1 || projects[0].isolate === false)
        throw new Error(
          '--no-cache currently requires one isolated test project.'
        )
      if (projects[0].typecheck?.enabled)
        throw new Error('--no-cache does not yet support typecheck projects.')
      projects = await sortUncachedTestProjects(projects)
      const project = projects[0]
      if (shuffleFiles(project.sequence?.shuffle)) {
        // One actual seed owns the runtime and report order, including the
        // default seed when this explicit uncached invocation omits it.
        const seed = project.sequence?.seed ?? Date.now()
        projects = [{ ...project, sequence: { ...project.sequence, seed } }]
        // The pinned pool clones specifications before sharding, so only
        // unsharded random ordering mutates its final report specification list.
        if (!shard)
          specificationOrder = shuffle([...project.entries], seed).map(
            (entry) => entry.id
          )
      }
    }
    const entries = projects.flatMap((project) => project.entries)
    standardCoverageSignalExit =
      options.coverage === true &&
      standardCoverageOptions !== undefined &&
      !options.watch &&
      !options.list &&
      !inspect &&
      apiPort === undefined &&
      !reporters.some(isCustomResultReporter) &&
      projects.length === 1 &&
      projects[0].isolate !== false &&
      (standardCoverageOptions.provider === 'istanbul'
        ? projects[0].profile.mode === 'production'
        : projects[0].profile.mode === 'development') &&
      projects[0].profile.environment === 'node' &&
      projects[0].profile.route === undefined &&
      projects[0].profile.browserClient === undefined &&
      !projects[0].executionEnvironment &&
      !projects[0].typecheck?.enabled &&
      !projects[0].customCoverage &&
      entries.length > 0 &&
      entries.every(
        (entry) =>
          /\.(?:js|mjs)$/.test(entry.file) &&
          entry.executionEnvironment === undefined
      )
    const customProjects = projects.filter(
      (project) =>
        coverageFlags.coverage !== false &&
        project.customCoverage &&
        project.entries.length
    )
    if (
      customProjects.length &&
      (maxWorkers !== 1 ||
        options.watch ||
        options.list ||
        inspect ||
        options.coverage ||
        options.update ||
        projects.some((project) => project.typecheck?.enabled) ||
        customProjects.some(
          (project) =>
            project.isolate === false ||
            project.executionEnvironment ||
            project.profile.environment !== 'node' ||
            !supportsCustomCoverageMode(
              project.profile.mode,
              project.entries.map((entry) => entry.file)
            ) ||
            project.profile.route ||
            project.entries.some((entry) => entry.executionEnvironment)
        ))
    )
      throw new Error(
        'Custom coverage requires one-shot isolated Node execution in development or plain JavaScript production without V8, DOM, type tests, debugging or snapshot updates.'
      )
    const sharedRscWatch =
      options.watch &&
      apiPort === undefined &&
      !configuration.compilerTransformNames.length &&
      isSharedRscWatchRun({
        operation: 'run',
        projectDir,
        projects,
        maxWorkers,
        collectOnly: options.list,
        inspect,
        inspectBrk,
        coverage: options.coverage,
        standardCoverageOptions,
        updateSnapshots: options.update,
        snapshotUpdateMode: process.env.CI ? 'none' : 'new',
      })
    if (
      !sharedRscWatch &&
      projects.some(
        (project) =>
          project.isolate === false && (options.watch || project.entries.length)
      ) &&
      (options.watch ||
        options.list ||
        inspect ||
        options.coverage ||
        maxWorkers !== 1)
    )
      throw new Error(
        'isolate:false currently requires a one-shot serial execution without watch, listing, debugging or coverage.'
      )
    if (options.list && !options.json) {
      for (const entry of entries) {
        const { profile } = entry
        console.log(
          `${entry.id} [${profile.environment}, ${profile.mode}, ${profile.runtime}, ${profile.bundler}]`
        )
      }
      console.log(`${entries.length} test file(s) selected.`)
      return
    }
    if (
      options.list &&
      options.json &&
      options.staticParse !== false &&
      options.staticParse !== 'false'
    ) {
      const { collectStaticTestCases } = await import(
        '../experimental/testing/static-collection.js'
      )
      const listed = await collectStaticTestCases(projects, {
        signal: controller.signal,
        testNamePattern: options.testNamePattern,
      })
      // Configuration owns a process even though static discovery does not run
      // its global setup or evaluate setup/specification modules. Publish only
      // after that owner has closed successfully.
      await configuration.dispose()
      configuration = undefined
      controller.signal.throwIfAborted()
      for (const error of listed.errors) console.error(error)
      if (listed.errors.length) {
        process.exitCode = 1
        return
      }
      console.log(JSON.stringify(listed.cases, null, 2))
      return
    }
    for (const project of projects) {
      if (!project.entries.length || project.profile.mode !== 'production')
        continue
      requireTestCapability('production')
      if (
        project.profile.route !== undefined &&
        project.profile.environment !== 'rsc'
      ) {
        throw new Error(
          'Production route context requires an explicit Node RSC profile.'
        )
      }
      if (
        !(
          testCapabilities.features.production.environments as readonly string[]
        ).includes(project.profile.environment)
      ) {
        throw new Error(
          'Unsupported production test environment. Supported environments are Node, RSC, and browser drivers.'
        )
      }
    }
    if (options.list && options.json) {
      let summary: Awaited<
        ReturnType<
          typeof import('../experimental/testing/orchestrator').runTests
        >
      >
      const messages: string[] = []
      const lock = await acquireTestRunLock(projectDir, {
        recoverSnapshots: false,
      })
      try {
        await configuration.setup(
          projects.filter((project) => project.entries.length)
        )
        const { runTests } = await import(
          '../experimental/testing/orchestrator.js'
        )
        summary = await runTests(projectDir, projects, {
          snapshotFormat: config.snapshotFormat,
          ...(configuration.compilerTransformNames.length
            ? { compilerTransforms: configuration.compilerTransforms(projects) }
            : {}),
          collectOnly: true,
          signal: controller.signal,
          write: () => {},
          reporter: { writeError: () => {} },
          onEvent(event) {
            if (event.type === 'diagnostic')
              messages.push(event.diagnostic.stack ?? event.diagnostic.message)
          },
          snapshotUpdateMode: 'none',
          testNamePattern: options.testNamePattern,
          maxWorkers,
          isolateProjects: true,
          passWithNoTests: true,
        })
      } finally {
        try {
          await configuration.dispose()
          configuration = undefined
        } finally {
          await lock.unlock()
        }
      }
      if (
        summary.status !== 'passed' ||
        summary.unsafeCleanup ||
        controller.signal.aborted
      ) {
        for (const message of messages) console.error(message)
        process.exitCode = summary.status === 'cancelled' ? 130 : 1
        return
      }
      if (!summary.collections) throw new Error('Missing collected test facts.')
      const collections = new Map(
        summary.collections.map((collection) => [
          collection.entryId,
          collection,
        ])
      )
      if (
        collections.size !== entries.length ||
        summary.collections.length !== entries.length
      )
        throw new Error('Collection did not complete every selected test file.')
      const listed = entries.flatMap((entry) => {
        const collection = collections.get(entry.id)
        if (!collection) throw new Error('Missing selected test collection.')
        return collection.cases.map((test) => ({
          name: test.name,
          file: entry.file,
        }))
      })
      console.log(JSON.stringify(listed, null, 2))
      return
    }
    const human = reporters.includes('default')
    const terminal = createTestTerminal({
      write: (text) => process.stdout.write(text),
      writeError: (text) => process.stderr.write(text),
      isTTY,
      columns: () => process.stdout.columns,
      rows: () => process.stdout.rows,
    })
    let reporterFailure: unknown
    const forceColor = process.env.FORCE_COLOR
    const reporter = {
      version: process.env.__NEXT_VERSION ?? 'unknown',
      writeError: (text: string) => {
        if (human) terminal.write(text, 'stderr')
      },
      terminal: human ? terminal : undefined,
      isTTY: human && isTTY,
      columns: process.stdout.columns,
      onError(error: unknown) {
        reporterFailure = error
        controller.abort(error)
      },
      color:
        forceColor !== undefined
          ? forceColor !== '0'
          : process.env.NO_COLOR === undefined &&
            process.env.NODE_DISABLE_COLORS === undefined &&
            !process.env.CI &&
            process.stdout.isTTY === true &&
            process.env.TERM !== 'dumb',
    }
    const preparePublicSnapshots =
      !options.watch &&
      !options.list &&
      (!options.cache || reporters.some(isCustomResultReporter)) &&
      options.shard === undefined &&
      apiPort === undefined &&
      options.testNamePattern === undefined &&
      projects[0]?.testNamePattern === undefined &&
      !inspect &&
      !options.inspectBrk &&
      !options.coverage &&
      !customProjects.length &&
      !standardCoverageOptions &&
      projects.length === 1 &&
      projects[0].entries.length === 1 &&
      projects[0].isolate !== false &&
      !projects[0].typecheck?.enabled &&
      projects[0].profile.environment === 'node' &&
      projects[0].profile.route === undefined &&
      projects[0].profile.browserClient === undefined &&
      (!projects[0].executionEnvironment ||
        projects[0].executionEnvironment.name === 'node') &&
      projects[0].entries.every(
        (entry) =>
          !entry.typecheck &&
          /\.(?:js|mjs)$/.test(entry.file) &&
          (!entry.executionEnvironment ||
            entry.executionEnvironment.name === 'node')
      ) &&
      (reporters.includes('default')
        ? !isTTY &&
          reporters.every((name) => name === 'default' || name === 'json')
        : reporters.includes('json') &&
          reporters.every(
            (name) => name === 'json' || isCustomResultReporter(name)
          ))
    const captureJUnitSuiteTasks =
      reporters.length === 1 &&
      reporters[0] === 'junit' &&
      !options.watch &&
      !options.list &&
      !options.cache &&
      options.shard === undefined &&
      apiPort === undefined &&
      options.testNamePattern === undefined &&
      projects[0]?.testNamePattern === undefined &&
      !inspect &&
      !options.inspectBrk &&
      !options.coverage &&
      !customProjects.length &&
      !standardCoverageOptions &&
      projects.length === 1 &&
      projects[0].entries.length === 1 &&
      projects[0].isolate !== false &&
      !projects[0].typecheck?.enabled &&
      projects[0].profile.environment === 'node' &&
      projects[0].profile.route === undefined &&
      projects[0].profile.browserClient === undefined &&
      (!projects[0].executionEnvironment ||
        projects[0].executionEnvironment.name === 'node') &&
      projects[0].entries.every(
        (entry) =>
          !entry.typecheck &&
          /\.(?:js|mjs)$/.test(entry.file) &&
          (!entry.executionEnvironment ||
            entry.executionEnvironment.name === 'node')
      )
    // This is an actual retained root realm and a selected ordinary boundary.
    // The final physical owner is provided below, after every parent owner joins.
    finalExitLifecycleEligible =
      configuration.finalExitOwnerAvailable &&
      reporters.some(isCustomResultReporter) &&
      !options.watch &&
      !inspect &&
      apiPort === undefined &&
      !options.typecheck &&
      !options['typecheck.only'] &&
      !options.coverage &&
      !standardCoverageOptions &&
      !customProjects.length &&
      projects.length === 1 &&
      entries.length > 0 &&
      maxWorkers === 1 &&
      projects[0].isolate !== false &&
      !projects[0].typecheck?.enabled &&
      projects[0].profile.environment === 'node' &&
      projects[0].profile.runtime === 'nodejs' &&
      projects[0].profile.bundler === 'turbopack' &&
      projects[0].profile.route === undefined &&
      projects[0].profile.browserClient === undefined &&
      !projects[0].executionEnvironment &&
      entries.every((entry) => !entry.typecheck && !entry.executionEnvironment)
    const machine = createMachineReporter({
      ...(captureJUnitSuiteTasks
        ? { captureJUnitSuiteTasks: true as const }
        : {}),
      collect: preparePublicSnapshots,
      projectDir,
      reporters,
      outputFile,
      presentation: { ...reporter, isTTY, terminal },
      write: (text) => terminal.write(text),
      writeError: (text) => terminal.write(text, 'stderr'),
    })
    try {
      // One owner covers the full watch lifetime, including journal recovery
      // before the first generation and every parent-side snapshot commit.
      runLock = await acquireTestRunLock(projectDir)
      // First actual result-cache caller: one-shot isolated ordinary Node.
      // Other profiles retain their existing behavior until independently qualified.
      if (
        options.cache === true &&
        !options.watch &&
        !options.list &&
        !inspect &&
        !standardCoverageOptions &&
        !options.coverage &&
        !customProjects.length &&
        !reporters.some(isCustomResultReporter) &&
        projects.length === 1 &&
        projects[0].isolate !== false &&
        projects[0].profile.environment === 'node' &&
        projects[0].profile.route === undefined &&
        !projects[0].executionEnvironment &&
        !projects[0].typecheck?.enabled &&
        !shuffleFiles(projects[0].sequence?.shuffle)
      ) {
        const { TestResultCache } = await import(
          '../experimental/testing/result-cache.js'
        )
        resultCache = new TestResultCache(
          projectDir,
          path.join(projectDir, '.next-test-cache', 'results.json')
        )
        await resultCache.read()
        projects = await sortCachedTestProjects(projects, resultCache)
        cacheStartTime = Date.now()
      }
      if (!options.watch && standardCoverageOptions?.clean === true) {
        const { prepareStandardCoverageDirectory } = await import(
          '../experimental/testing/coverage/report-standard.js'
        )
        await prepareStandardCoverageDirectory(
          projectDir,
          standardCoverageOptions,
          controller.signal
        )
      }
      if (options.watch) {
        const { watchTests } = await import(
          '../experimental/testing/watch-orchestrator.js'
        )
        const watchRelatedSources =
          options.changed && !options.related
            ? await (
                await import(
                  '../experimental/testing/incremental/source-selection.js'
                )
              ).findChangedTestSources(projectDir, options.changed)
            : options.related
        let hasFailedWatchRun = false
        // The watch owner keeps this actual realm through all reporter
        // generations. Its finalizer becomes the sole configuration disposer.
        const watchConfiguration = reporters.some(isCustomResultReporter)
          ? configuration
          : undefined
        if (watchConfiguration) configuration = undefined
        const result = await watchTests(projectDir, {
          ...(watchConfiguration
            ? { initialConfiguration: watchConfiguration }
            : {}),
          apiPort,
          onEvent(event) {
            if (event.type === 'run-end' && event.status === 'failed')
              hasFailedWatchRun = true
          },
          input: isTTY ? process.stdin : undefined,
          output: process.stdout,
          project: options.project,
          files: options.filter,
          related: watchRelatedSources,
          ...(options.changed && !options.related
            ? { initialRelatedFromChanged: true as const }
            : {}),
          testNamePattern: options.testNamePattern,
          // Retain the CLI count independently of the initial authored limit:
          // later configuration generations select parallelism afresh.
          maxWorkers:
            options.maxWorkers === undefined
              ? undefined
              : options.fileParallelism === false
                ? 1
                : parseMaxWorkers(options.maxWorkers),
          fileParallelism: options.fileParallelism,
          standardCoverageOptions: cliStandardCoverageOptions,
          coverageFlags,
          resultReporters: reporters,
          outputFile,
          writeReport: (text) => process.stdout.write(text),
          resultPresentation: { ...reporter, isTTY, terminal },
          writeError: (text) => process.stderr.write(text),
          snapshotUpdateMode: process.env.CI ? 'none' : 'new',
          configOverrides: overrides,
          signal: controller.signal,
          write: (text) => {
            if (human) terminal.write(text)
          },
          reporter,
        })
        if (reporterFailure) throw reporterFailure
        process.exitCode =
          hasFailedWatchRun || result.status === 'failed'
            ? 1
            : result.status === 'cancelled'
              ? 130
              : 0
        return
      }
      controller.signal.throwIfAborted()
      if (apiPort !== undefined) {
        const { openTestDiscoveryApi } = await import(
          '../experimental/testing/editor-api.js'
        )
        discoveryApi = await openTestDiscoveryApi(
          projectDir,
          entries,
          apiPort,
          {
            cancelRun: cancel,
          }
        )
        process.stderr.write(
          'Next test discovery API: ' + discoveryApi.url + '\n'
        )
      }
      controller.signal.throwIfAborted()
      await machine.initialize({
        signal: controller.signal,
        ...(finalExitLifecycleEligible
          ? {
              finalExitLifecycle: {
                teardownTimeout: config.teardownTimeout ?? 10000,
              },
            }
          : {}),
        ...(!customProjects.length &&
        !standardCoverageOptions &&
        configuration.finalExitOwnerAvailable
          ? { reporterTransport: configuration.openReporterTransport }
          : {}),
      })
      if (machine.captureRunStart) {
        await machine.beginRun(
          projects,
          specificationOrder.filter((id) =>
            entries.some((entry) => entry.id === id)
          ),
          options.coverage === true || customProjects.length > 0
        )
        controller.signal.throwIfAborted()
      }
      if (
        entries.length > 0 &&
        machine.captureModuleStart &&
        !preparePublicSnapshots
      )
        throw new Error(
          'Module Start reporters require one isolated ordinary JavaScript file with actual public snapshot preparation and JSON output.'
        )
      controller.signal.throwIfAborted()
      await configuration.setup(
        projects.filter((project) => project.entries.length)
      )
      controller.signal.throwIfAborted()
      const customCoverageRequests: Record<string, CustomCoverageRequest> = {}
      for (const project of customProjects) {
        const session = await openCustomCoverageSession({
          projectDir,
          config: project.customCoverage!,
          signal: controller.signal,
          onOutput(stream, chunk) {
            ;(stream === 'stdout' ? process.stdout : process.stderr).write(
              chunk
            )
          },
        })
        customSessions.set(project.profile.id, session)
        projectsForCustomCoverage.set(
          project.profile.id,
          project.entries.map((entry) => entry.id)
        )
        customCoverageRequests[project.profile.id] = session.request
      }
      const { runTests } = await import(
        '../experimental/testing/orchestrator.js'
      )
      customExecutionStarted = customProjects.length > 0
      let summary: Awaited<ReturnType<typeof runTests>>
      oneShotExecutionActive = true
      try {
        summary = await runTests(projectDir, projects, {
          snapshotFormat: config.snapshotFormat,
          ...(captureJUnitSuiteTasks
            ? { captureJUnitSuiteTasks: true as const }
            : {}),
          ...(preparePublicSnapshots
            ? {
                preparePublicSnapshots: true as const,
                onSnapshotPreparationFailure:
                  machine.onSnapshotPreparationFailure,
              }
            : {}),
          ...(standardCoverageOptions &&
          standardCoverageOptions.provider === undefined
            ? { captureOneShotV8CollectionRestoration: true as const }
            : {}),
          ...(standardCoverageOptions &&
          standardCoverageOptions.provider === undefined &&
          !options.update &&
          process.env.CI
            ? { captureOneShotV8ReadOnlySnapshots: true as const }
            : {}),
          ...(entries.length > 0 && machine.captureTestRecords
            ? {
                captureTestRecords: true as const,
                onTestRecord: machine.onTestRecord,
              }
            : {}),
          ...(entries.length > 0 && machine.captureSuiteEvents === true
            ? { captureSuiteEvents: true as const }
            : {}),
          ...(entries.length > 0 && machine.captureHookEvents === true
            ? { captureHookEvents: true as const }
            : {}),
          ...(entries.length > 0 && machine.captureCaseReady === true
            ? { captureCaseReady: true as const }
            : {}),
          ...(entries.length > 0 && machine.captureModuleStart
            ? { captureModuleStart: true as const }
            : {}),
          ...(entries.length > 0 && machine.captureModuleCollected
            ? { captureModuleCollected: true as const }
            : {}),
          ...(entries.length > 0 && machine.captureModuleQueued
            ? { onModuleQueued: machine.onModuleQueued }
            : {}),
          captureTaskResults: machine.captureTaskResults,
          ...(resultCache
            ? {
                onCompletedModules(facts) {
                  const project = projects[0]
                  const selected = new Map(
                    project.entries.map((entry) => [entry.id, entry])
                  )
                  pendingCacheUpdates = facts.flatMap((completion) => {
                    const entry = selected.get(completion.entryId)
                    if (
                      !entry ||
                      completion.kind !== 'fulfilled' ||
                      completion.finalState === null
                    )
                      return []
                    return [
                      {
                        projectName: project.displayName ?? '',
                        file: entry.file,
                        failed: completion.finalState === 'fail',
                        duration: completion.durationMs,
                        partial:
                          completion.containsOnly ||
                          !!options.testNamePattern ||
                          !!project.testNamePattern,
                      },
                    ]
                  })
                },
              }
            : {}),
          ...(configuration.compilerTransformNames.length
            ? { compilerTransforms: configuration.compilerTransforms(projects) }
            : {}),
          signal: controller.signal,
          write: (text) => {
            if (human) terminal.write(text)
          },
          reporter,
          onConsoleDrain: () => machine.drainConsole(),
          onEvent(event) {
            if (event.type === 'run-end') oneShotExecutionActive = false
            discoveryApi?.onEvent(event)
            machine.onEvent(event)
          },
          specificationOrder: specificationOrder.filter((id) =>
            entries.some((entry) => entry.id === id)
          ),
          updateSnapshots: options.update ?? false,
          snapshotUpdateMode: options.update
            ? 'all'
            : process.env.CI
              ? 'none'
              : 'new',
          testNamePattern: options.testNamePattern,
          coverage: options.coverage ?? false,
          standardCoverageOptions,
          coverageInputs: configuration.compilerInputsForProjects(projects),
          ...(customProjects.length
            ? {
                customCoverageRequests,
                onCustomCoverageSuite: async (fact: CustomCoverageFact) => {
                  const owners = [...projectsForCustomCoverage].filter(
                    ([, ownedEntries]) =>
                      ownedEntries.includes(fact.completion.entryId)
                  )
                  if (owners.length !== 1)
                    throw new Error(
                      'Custom coverage suite has no unique project owner.'
                    )
                  await customSessions.get(owners[0][0])!.afterSuite(fact)
                },
              }
            : {}),
          ...(coverageFlags.coverage === false
            ? { customCoverageDisabled: true as const }
            : {}),
          inspect,
          ...(inspectBrk ? { inspectBrk: true } : {}),
          maxWorkers,
          isolateProjects: true,
          passWithNoTests: projects.every(
            (project) => project.passWithNoTests === true
          ),
        })
      } finally {
        oneShotExecutionActive = false
      }
      customWritersClosed = !summary.unsafeCleanup
      await discoveryApi?.dispose()
      discoveryApi = undefined
      if (reporterFailure) throw reporterFailure
      if (
        standardCoverageOptions &&
        summary.status !== 'cancelled' &&
        summary.status !== 'running' &&
        !summary.unsafeCleanup &&
        (standardCoverageOptions.provider === 'istanbul'
          ? summary.istanbulCoverage && summary.istanbulSourcePlan
          : summary.standardCoverage)
      ) {
        pendingCoverage =
          standardCoverageOptions.provider === 'istanbul'
            ? {
                facts: summary.istanbulCoverage!,
                plan: summary.istanbulSourcePlan!,
                ...(summary.istanbulSourceDeclarations
                  ? {
                      declarations: summary.istanbulSourceDeclarations,
                      runtimeConfiguration: {
                        receipts: summary.runtimeConfigurationReceipts ?? [],
                        plan: summary.runtimeConfigurationPlan!,
                      },
                    }
                  : {}),
                expected: new Set(entries.map((entry) => entry.id)),
                config: standardCoverageOptions,
                status: summary.status,
              }
            : {
                facts: summary.standardCoverage!,
                runtimeConfiguration: {
                  receipts: summary.runtimeConfigurationReceipts ?? [],
                  plan: summary.runtimeConfigurationPlan!,
                },
                sourceAnalysis: {
                  facts: summary.compilerSourceCoverage ?? [],
                  plan: summary.coverageSourcePlan ?? {
                    version: 1,
                    requests: [],
                    inputs: [],
                  },
                },
                expected: new Set(entries.map((entry) => entry.id)),
                excludedFiles: projects.flatMap((project) => [
                  ...project.setupFiles,
                  ...project.entries.map((entry) => entry.file),
                ]),
                config: standardCoverageOptions,
                status: summary.status,
              }
      }
      if (pendingCoverage)
        deferredResultReporterDisposal = () =>
          machine.dispose({ handledCustomFailure: resultCompletionError })
      let preparedCoverageMap: PreparedCoverageMap | undefined
      let coveragePreparationFailed = false
      let coveragePreparationError: unknown
      if (pendingCoverage && reporters.includes('json')) {
        try {
          configuration?.assertReadyForCoverage()
          await publishPendingCoverage({
            prepareOnly: true,
            onCoverageMap(map) {
              preparedCoverageMap = map
            },
          })
          if (preparedCoverageMap === undefined)
            throw new Error('Standard coverage did not produce its actual map.')
        } catch (error) {
          if (
            summary.status !== 'failed' ||
            summary.unsafeCleanup ||
            controller.signal.aborted
          )
            throw error
          // The settled run already owns its failure diagnostics. Preserve that
          // actual JSON without claiming a map from rejected coverage facts.
          // Rethrow after normal result completion, before publication/retry.
          preparedCoverageMap = undefined
          coveragePreparationFailed = true
          coveragePreparationError = error
        }
      }
      const createPendingCustomCoverage = () => {
        if (customProjects.length && summary.status !== 'cancelled') {
          if (summary.unsafeCleanup || summary.status === 'running')
            throw new Error(
              'Custom coverage did not complete after clean execution.'
            )
          const facts = assertCustomCoverageFacts(
            summary.customCoverage,
            projectDir,
            projects,
            customCoverageRequests
          )
          return {
            facts,
            status: summary.status,
            allTestsRun:
              !options.filter?.length &&
              !options.testNamePattern &&
              !shard &&
              !projects.some((project) => project.testNamePattern),
          }
        }
      }
      let customCoverageResult: CustomCoverageResult | undefined
      const customCoverageJson =
        customSessions.size === 1 && reporters.includes('json')
      const customCoverageWithoutJson =
        customSessions.size === 1 && !reporters.includes('json')
      if (customCoverageJson) {
        pendingCustomCoverage = createPendingCustomCoverage()
        if (pendingCustomCoverage) {
          const [id, session] = customSessions.entries().next().value!
          const entriesForProject = new Set(projectsForCustomCoverage.get(id))
          customCoverageResult = await session.generate(
            pendingCustomCoverage.facts.filter((fact) =>
              entriesForProject.has(fact.completion.entryId)
            ),
            pendingCustomCoverage.status,
            pendingCustomCoverage.allTestsRun
          )
          if (
            reporters.every(
              (name) => name === 'json' || isCustomResultReporter(name)
            ) &&
            typeof machine.beginCustomCompletionPrefix === 'function'
          )
            await machine.beginCustomCompletionPrefix()
          else await machine.beginCustomCompletion()
        }
      } else if (customCoverageWithoutJson) {
        pendingCustomCoverage = createPendingCustomCoverage()
        if (pendingCustomCoverage) {
          const [id, session] = customSessions.entries().next().value!
          const entriesForProject = new Set(projectsForCustomCoverage.get(id))
          await session.prepare(
            pendingCustomCoverage.facts.filter((fact) =>
              entriesForProject.has(fact.completion.entryId)
            ),
            pendingCustomCoverage.status,
            pendingCustomCoverage.allTestsRun
          )
        }
      }
      // Empty selection still invokes RunEnd before a later JSON writer.
      const firstJsonReporter = reporters.indexOf('json')
      if (
        entries.length === 0 &&
        firstJsonReporter > 0 &&
        reporters.slice(0, firstJsonReporter).every(isCustomResultReporter) &&
        reporters.slice(firstJsonReporter).every((name) => name === 'json')
      )
        await machine.beginCustomCompletionPrefix()
      try {
        await machine.finish(
          interruptedExecutionJson
            ? {
                ...(preparedCoverageMap === undefined
                  ? {}
                  : { preparedCoverageMap }),
                ...(customCoverageResult === undefined
                  ? {}
                  : { customCoverageResult }),
                omitInterruptedExecutionJson: true,
              }
            : preparedCoverageMap === undefined &&
                customCoverageResult === undefined
              ? undefined
              : {
                  ...(preparedCoverageMap === undefined
                    ? {}
                    : { preparedCoverageMap }),
                  ...(customCoverageResult === undefined
                    ? {}
                    : { customCoverageResult }),
                }
        )
      } catch (error) {
        const failure = coveragePreparationFailed
          ? new AggregateError(
              [coveragePreparationError, error],
              'Coverage preparation and result reporting failed.'
            )
          : error
        if (pendingCoverage) resultCompletionError = failure
        throw failure
      }
      if (coveragePreparationFailed) throw coveragePreparationError
      if (!customCoverageJson && !customCoverageWithoutJson)
        pendingCustomCoverage = createPendingCustomCoverage()
      if (standardCoverageOptions && summary.status !== 'cancelled') {
        if (summary.status === 'running')
          throw new Error('Standard coverage requires a terminal run result.')
        if (
          summary.unsafeCleanup ||
          (standardCoverageOptions.provider === 'istanbul'
            ? !summary.istanbulCoverage || !summary.istanbulSourcePlan
            : !summary.standardCoverage)
        )
          throw new Error(
            'Standard coverage did not complete after clean execution.'
          )
      }
      if (interruptedExecutionJson || summary.status !== 'passed') {
        process.exitCode =
          interruptedExecutionJson || summary.status === 'cancelled' ? 130 : 1
      }
    } catch (error) {
      pendingFinalFailure = true
      throw error
    } finally {
      try {
        await discoveryApi?.dispose()
      } catch (error) {
        pendingFinalFailure = true
        throw error
      } finally {
        try {
          terminal.dispose()
        } catch (error) {
          pendingFinalFailure = true
          throw error
        } finally {
          try {
            await machine.dispose(
              finalExitLifecycleEligible && pendingFinalFailure
                ? { exitCodeSnapshot: { value: 1 } }
                : deferredResultReporterDisposal
                  ? { deferCustom: true }
                  : undefined
            )
          } catch (error) {
            pendingFinalFailure = true
            throw error
          }
        }
      }
    }
    cleanedExecution = true
  } catch (error) {
    pendingFinalFailure = true
    if (pendingCoverage) resultCompletionError ??= error
    if (
      standardCoverageSignalExit &&
      sigintReason !== undefined &&
      error === sigintReason &&
      controller.signal.reason === sigintReason
    ) {
      process.exitCode = 130
      return
    }
    throw error
  } finally {
    const deferredConfiguration = cleanedExecution && !!pendingCoverage
    let coverageCompletionError: unknown = resultCompletionError
    try {
      if (!deferredConfiguration) {
        if (finalExitLifecycleEligible) {
          preparedFinalExit = await configuration?.prepareFinalExit()
          if (preparedFinalExit) {
            // This is the child's value after actual teardown and onClose,
            // including an authored zero or explicit undefined clear.
            process.exitCode = preparedFinalExit.exitCode
            pendingFinalFailure = false
          }
        }
        await configuration?.dispose()
      }
      if (
        cleanedExecution &&
        resultCache &&
        pendingCacheUpdates &&
        !controller.signal.aborted
      )
        await resultCache.update(pendingCacheUpdates, cacheStartTime!)
      if (cleanedExecution && pendingCustomCoverage) {
        controller.signal.throwIfAborted()
        for (const [id, session] of customSessions) {
          const entriesForProject = new Set(projectsForCustomCoverage.get(id))
          await session.finish(
            pendingCustomCoverage.facts.filter((fact) =>
              entriesForProject.has(fact.completion.entryId)
            ),
            pendingCustomCoverage.status,
            pendingCustomCoverage.allTestsRun
          )
        }
      }
      if (cleanedExecution && pendingCoverage) {
        try {
          configuration?.assertReadyForCoverage()
          const result = await publishPendingCoverage()
          if (result.textSummary) process.stdout.write(result.textSummary)
          if (result.thresholdErrors.length) {
            for (const message of result.thresholdErrors)
              console.error(
                pendingCoverage.config.formatterReports
                  ? `ERROR: ${message}`
                  : message
              )
            process.exitCode = 1
          }
          if (
            result.published &&
            pendingCoverage.config.thresholds.autoUpdate
          ) {
            const { updateCoverageThresholds } = await import(
              '../experimental/testing/coverage/threshold-update.js'
            )
            let updated: boolean
            if (configuration?.prepareCoverageThresholdUpdate) {
              controller.signal.throwIfAborted()
              const writtenSource =
                await configuration.prepareCoverageThresholdUpdate(
                  result.thresholdUpdates ?? []
                )
              controller.signal.throwIfAborted()
              updated = writtenSource !== undefined
            } else {
              updated = await updateCoverageThresholds({
                configFile: configuration?.coverageConfigurationFile,
                updates: result.thresholdUpdates ?? [],
                signal: controller.signal,
              })
            }
            if (updated)
              console.log(
                'Updating thresholds to configuration file. You may want to push with updated coverage thresholds.'
              )
          }
        } catch (error) {
          if (controller.signal.aborted) process.exitCode = 130
          else throw error
        }
      }
    } catch (error) {
      if (
        !preparedFinalExit?.initialCloseFailure ||
        !Object.is(error, preparedFinalExit.initialCloseFailure.error)
      )
        pendingFinalFailure = true
      if (coverageCompletionError && coverageCompletionError !== error) {
        const combined = new AggregateError(
          [coverageCompletionError, error],
          'Result reporting and coverage completion failed.'
        )
        coverageCompletionError = combined
        throw combined
      }
      coverageCompletionError = error
      throw error
    } finally {
      try {
        let configurationCleanupError: unknown
        try {
          if (deferredConfiguration) {
            try {
              await configuration?.dispose()
            } catch (error) {
              if (coverageCompletionError && coverageCompletionError !== error)
                throw new AggregateError(
                  [coverageCompletionError, error],
                  configuration?.formatCoverageThresholdUpdates
                    ? 'Coverage threshold update and configuration cleanup failed.'
                    : 'Coverage reporting and configuration cleanup failed.'
                )
              throw error
            }
          }
        } catch (error) {
          configurationCleanupError = error
        }
        try {
          await deferredResultReporterDisposal?.()
        } catch (error) {
          const prior = configurationCleanupError ?? coverageCompletionError
          if (prior && prior !== error)
            throw new AggregateError(
              [prior, error],
              'Coverage completion and result reporter cleanup failed.'
            )
          throw error
        }
        if (configurationCleanupError) throw configurationCleanupError
      } catch (error) {
        pendingFinalFailure = true
        throw error
      } finally {
        try {
          const failures = []
          for (const session of customSessions.values()) {
            try {
              await session.dispose({
                retainPayloads:
                  customExecutionStarted &&
                  (!cleanedExecution || !customWritersClosed),
              })
            } catch (error) {
              failures.push(error)
            }
          }
          if (failures.length)
            throw new AggregateError(
              failures,
              'Custom coverage cleanup failed.'
            )
        } catch (error) {
          pendingFinalFailure = true
          throw error
        } finally {
          try {
            await runLock?.unlock()
          } catch (error) {
            pendingFinalFailure = true
            throw error
          } finally {
            try {
              const physicalExit = preparedFinalExit
                ? preparedFinalExit.finalize(
                    controller.signal.aborted
                      ? { kind: 'cancelled', reason: controller.signal.reason }
                      : pendingFinalFailure
                        ? { kind: 'failed' }
                        : { kind: 'completed' }
                  )
                : finalExitLifecycleEligible
                  ? configuration?.physicalExit
                  : undefined
              if (physicalExit) {
                const result = await physicalExit
                if (result !== undefined) {
                  process.exitCode = controller.signal.aborted
                    ? 130
                    : result.reason === 'exit'
                      ? (result.code ?? 1)
                      : 1
                  onFinalProcessExit?.(result)
                }
              }
            } finally {
              // Keep the original first-signal owners until the real child and
              // its output streams join, including signals after final ACK.
              process.removeListener('SIGINT', interrupt)
              process.removeListener('SIGTERM', cancel)
            }
          }
        }
      }
    }
  }
}
