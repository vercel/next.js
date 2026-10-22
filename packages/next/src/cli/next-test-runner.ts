import type {
  RuntimeConfigurationPlan,
  RuntimeConfigurationReceipt,
} from '../experimental/testing/coverage/runtime-configuration'
import type { CoverageSourcePlan } from '../experimental/testing/coverage/source-analysis-plan'
import {
  openCustomCoverageSession,
  type CustomCoverageSession,
} from '../experimental/testing/coverage/custom-session'
import { assertCustomCoverageFacts } from '../experimental/testing/coverage/custom-facts'
import type {
  CustomCoverageFact,
  CustomCoverageRequest,
} from '../experimental/testing/coverage/custom-types'
import { realpath } from 'fs/promises'
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
import {
  applyTestConfigOverrides,
  openTestConfiguration,
  type TestConfigOverrides,
} from '../experimental/testing/config'
import { discoverTests } from '../experimental/testing/discovery'
import { configDefaults } from '../experimental/testing/config-api'
import {
  parseTestInspectAddress,
  parseTestInspectBrkAddress,
} from '../experimental/testing/execution/inspector'
import {
  acquireTestRunLock,
  parseMaxWorkers,
  parseTestShard,
  shardTestProjects,
} from '../experimental/testing/scheduling'
import { createTestTerminal } from '../experimental/testing/reporting/terminal'
import {
  requireTestCapability,
  testCapabilities,
} from '../experimental/testing/capabilities'

export interface NextTestRunnerOptions {
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
  'coverage.reporter'?: string[]
  'coverage.include'?: string[]
  'coverage.exclude'?: string[]
  'coverage.reportsDirectory'?: string
  'coverage.reportOnFailure'?: boolean | string
  'coverage.cleanOnRerun'?: boolean | string
  'coverage.thresholds.statements'?: string
  'coverage.thresholds.functions'?: string
  'coverage.thresholds.branches'?: string
  'coverage.thresholds.lines'?: string
  inspect?: string | boolean
  inspectBrk?: string | boolean
  fileParallelism?: boolean
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
    typecheck: options['typecheck.only']
      ? { enabled: true, only: true }
      : options.typecheck === undefined
        ? undefined
        : { enabled: options.typecheck },
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

export async function nextTestRunner(
  directory: string | undefined,
  options: NextTestRunnerOptions
): Promise<void> {
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
  if (standardCoverageOptions && options.coverage !== false)
    options = { ...options, coverage: true }
  if (options.coverage === false) standardCoverageOptions = undefined
  const cliStandardCoverageOptions = standardCoverageOptions
  const breakAddress = parseTestInspectBrkAddress(options.inspectBrk)
  const inspectBrk = breakAddress !== undefined
  const inspect = inspectBrk
    ? (parseTestInspectBrkAddress(options.inspect) ?? breakAddress)
    : parseTestInspectAddress(options.inspect)
  const isTTY =
    process.stdout.isTTY === true &&
    !process.env.CI &&
    process.env.TERM !== 'dumb'
  if (
    options.watch === undefined &&
    !options.related &&
    !options.changed &&
    options.api === undefined &&
    configDefaults.watch &&
    !options.run &&
    !options.list &&
    !options.update &&
    !options.coverage &&
    !options.typecheck &&
    !options['typecheck.only'] &&
    !options.capabilities &&
    !options.mergeReports &&
    !inspect
  )
    options = { ...options, watch: true }
  if (
    inspect &&
    (options.list || options.watch || options.coverage || options.mergeReports)
  )
    throw new Error(
      '--inspect currently requires a one-shot execution without coverage.'
    )
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
      options.fileParallelism === false ||
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
  const reporters = parseResultReporters(options.reporter)
  if (options.watch && reporters.some(isCustomResultReporter))
    throw new Error(
      'Custom reporter watch lifecycle adapters remain unimplemented; completion adapters require a one-shot run.'
    )
  if (options.list && reporters.some((name) => name !== 'default')) {
    throw new Error('Machine collection reports remain unimplemented.')
  }
  if (options.outputFile && !reporters.some(isMachineResultReporter)) {
    throw new Error('--outputFile requires a machine reporter.')
  }
  if (
    options.outputFile &&
    reporters.filter(isMachineResultReporter).length !== 1
  ) {
    throw new Error('--outputFile requires exactly one machine reporter.')
  }
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
  let cleanedExecution = false
  let pendingCoverage:
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
  const cancel = () => controller.abort(new Error('Test run interrupted.'))
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  let configuration:
    | Awaited<ReturnType<typeof openTestConfiguration>>
    | undefined
  try {
    configuration = await openTestConfiguration(projectDir, controller.signal)
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
      config.projects.some((project) => project.typecheck?.enabled) &&
      (options.watch || options.list || inspect || options.coverage)
    ) {
      throw new Error(
        'Type-test checking currently requires a one-shot execution without --watch, --list, --inspect, or --coverage.'
      )
    }
    const maxWorkers =
      options.fileParallelism === false
        ? 1
        : parseMaxWorkers(options.maxWorkers ?? config.maxWorkers)
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
    const configuredCoverage = resolveProjectStandardCoverage(
      projects,
      coverageFlags,
      standardCoverageOptions
    )
    if (configuredCoverage.configured) {
      options = { ...options, coverage: configuredCoverage.enabled }
      standardCoverageOptions = configuredCoverage.options
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
              project.profile.environment !== 'node' ||
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
      !(options.list && options.json) &&
      !projects.every((project) => project.passWithNoTests === true)
    ) {
      throw new Error(
        'No test files matched the selected projects and filters.'
      )
    }
    const specificationOrder = projects.flatMap((project) =>
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
      projects = await shardTestProjects(projects, shard, projectDir)
    }
    const entries = projects.flatMap((project) => project.entries)
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
            project.profile.mode !== 'development' ||
            project.profile.route ||
            project.entries.some((entry) => entry.executionEnvironment)
        ))
    )
      throw new Error(
        'Custom coverage currently requires one-shot isolated development Node execution without V8, DOM, type tests, debugging or snapshot updates.'
      )
    if (
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
    const machine = createMachineReporter({
      projectDir,
      reporters,
      outputFile: options.outputFile,
      presentation: { ...reporter, isTTY, terminal },
      write: (text) => terminal.write(text),
      writeError: (text) => terminal.write(text, 'stderr'),
    })
    let runLock: Awaited<ReturnType<typeof acquireTestRunLock>> | undefined
    try {
      // One owner covers the full watch lifetime, including journal recovery
      // before the first generation and every parent-side snapshot commit.
      runLock = await acquireTestRunLock(projectDir)
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
        const result = await watchTests(projectDir, {
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
          maxWorkers: options.maxWorkers === undefined ? undefined : maxWorkers,
          standardCoverageOptions: cliStandardCoverageOptions,
          coverageFlags,
          resultReporters: reporters,
          outputFile: options.outputFile,
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
      await machine.initialize({ signal: controller.signal })
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
      const summary = await runTests(projectDir, projects, {
        captureTaskResults: machine.captureTaskResults,
        ...(configuration.compilerTransformNames.length
          ? { compilerTransforms: configuration.compilerTransforms(projects) }
          : {}),
        signal: controller.signal,
        write: (text) => {
          if (human) terminal.write(text)
        },
        reporter,
        onEvent(event) {
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
        coverageInputs: configuration.watchInputs,
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
      customWritersClosed = !summary.unsafeCleanup
      await discoveryApi?.dispose()
      discoveryApi = undefined
      if (reporterFailure) throw reporterFailure
      await machine.finish()
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
        pendingCustomCoverage = {
          facts,
          status: summary.status,
          allTestsRun:
            !options.filter?.length &&
            !options.testNamePattern &&
            !shard &&
            !projects.some((project) => project.testNamePattern),
        }
      }
      if (standardCoverageOptions && summary.status !== 'cancelled') {
        if (summary.status === 'running')
          throw new Error('Standard coverage requires a terminal run result.')
        if (summary.unsafeCleanup || !summary.standardCoverage)
          throw new Error(
            'Standard coverage did not complete after clean execution.'
          )
        pendingCoverage = {
          facts: summary.standardCoverage,
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
      if (summary.status !== 'passed') {
        process.exitCode = summary.status === 'cancelled' ? 130 : 1
      }
    } finally {
      try {
        await discoveryApi?.dispose()
      } finally {
        try {
          terminal.dispose()
        } finally {
          try {
            await machine.dispose()
          } finally {
            await runLock?.unlock()
          }
        }
      }
    }
    cleanedExecution = true
  } finally {
    try {
      await configuration?.dispose()
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
          const { publishStandardCoverage } = await import(
            '../experimental/testing/coverage/report-standard.js'
          )
          const result = await publishStandardCoverage({
            projectDir,
            ...pendingCoverage,
            signal: controller.signal,
          })
          if (result.textSummary) process.stdout.write(result.textSummary)
          if (result.thresholdErrors.length) {
            for (const message of result.thresholdErrors) console.error(message)
            process.exitCode = 1
          }
        } catch (error) {
          if (controller.signal.aborted) process.exitCode = 130
          else throw error
        }
      }
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
          throw new AggregateError(failures, 'Custom coverage cleanup failed.')
      } finally {
        process.removeListener('SIGINT', cancel)
        process.removeListener('SIGTERM', cancel)
      }
    }
  }
}
