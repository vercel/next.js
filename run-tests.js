//@ts-check

const path = require('path')
const os = require('os')
const _glob = require('glob')
const fs = require('fs')
const fsp = require('fs/promises')
const { createClient } = require('@vercel/kv')
const { promisify } = require('util')
const { createHash } = require('crypto')
const { Sema } = require('async-sema')
const { spawn, exec: execOrig } = require('child_process')
const crossSpawn = require('cross-spawn')
const { createNextInstall } = require('./test/lib/create-next-install')
const { getBrowserLaunch } = require('./test/lib/browsers/launch')
const glob = promisify(_glob)
const exec = promisify(execOrig)
const core = require('@actions/core')
const { getTestFilter } = require('./test/get-test-filter')
const { buildTestReport } = require('./scripts/test-report')

// --- Test profile and result caching via actions cache ---
// On CI retry attempts, skip tests that already passed on this commit.
// The file contains null-byte delimited filenames

class TestProfile {
  // Env vars that always affect test behavior (non-NEXT prefixed).
  static EXTRA_ENV_VARS = [
    'IS_WEBPACK_TEST',
    'IS_TURBOPACK_TEST',
    'TURBOPACK_DEV',
    'TURBOPACK_BUILD',
    'BROWSER_NAME',
    'DEVICE_NAME',
  ]

  // NEXT_* / __NEXT* vars that are operational, not behavioral.
  static IGNORED_VARS = new Set([
    'NEXT_TELEMETRY_DISABLED',
    'NEXT_TEST_JOB',
    'NEXT_JUNIT_TEST_REPORT',
    'NEXT_TEST_PREFER_OFFLINE',
    'NEXT_CI_RUNNER',
    'NEXT_E2E_TEST_TIMEOUT',
    'NEXT_TURBOPACK_IO_CONCURRENCY',
    'NEXT_TEST_PASSED_FILE',
    'NEXT_TEST_BROWSER_WS_ENDPOINT',
    'TURBO_TASKS_AVAILABLE_PARALLELISM',
  ])

  // All key=value pairs identifying this test profile, sorted by key.
  // Used for the diagnostic `log()` output. Computed once at construction
  // from a snapshot of process.env. The actual cache key for the workflow
  // is `input_step_key` (see `.github/workflows/build_reusable.yml`).
  entries
  // NEXT_*/__NEXT* vars that matched the pattern but were ignored.
  ignoredVars
  cachingEnabled

  constructor({ group = '', type = '', testPattern = '', runCount = 1 } = {}) {
    this.cachingEnabled = !!(
      process.env.CI &&
      process.env.GITHUB_SHA &&
      !process.env.NEXT_FLAKE_DETECTION &&
      !process.env.NEXT_TEST_SKIP_RESULT_CACHE &&
      runCount === 1
    )

    // Snapshot env at construction time so dynamic vars set during the run
    // (e.g. NEXT_TEST_STARTER, NEXT_TEST_PKG_PATHS) don't pollute the key.
    const env = { ...process.env }

    // Collect env vars that affect test behavior
    const vars = new Map()
    for (const v of TestProfile.EXTRA_ENV_VARS) {
      if (env[v]) vars.set(v, env[v])
    }
    const ignored = []
    for (const key of Object.keys(env)) {
      if (
        (key.startsWith('NEXT_') || key.startsWith('__NEXT')) &&
        !key.startsWith('NEXT_SKIP_')
      ) {
        if (TestProfile.IGNORED_VARS.has(key)) {
          ignored.push(key)
        } else {
          vars.set(key, env[key])
        }
      }
    }
    this.ignoredVars = ignored.sort()

    // Build the single sorted entries list used for hashing, logging, and descriptions.
    const branch =
      process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || ''
    const map = new Map([
      ['os', process.platform],
      ['branch', branch],
      ['sha', process.env.GITHUB_SHA || ''],
      ['node', process.versions.node.split('.')[0]],
    ])
    if (group) map.set('group', group)
    if (type) map.set('type', type)
    if (testPattern) map.set('testPattern', testPattern)
    for (const [k, v] of [...vars.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      map.set(k, v)
    }
    this.entries = [...map.entries()]
  }

  get description() {
    return this.entries
      .map(([k, v]) => (k === 'sha' ? `sha=${v?.slice(0, 10)}` : `${k}=${v}`))
      .join(' | ')
  }

  log() {
    console.log(`\nTest profile:`)
    for (const [k, v] of this.entries) {
      console.log(`  ${k}=${k === 'sha' ? v?.slice(0, 10) : v}`)
    }
    if (this.ignoredVars.length > 0) {
      console.log(`  Ignored: ${this.ignoredVars.join(', ')}`)
    }
    console.log(`  Caching: ${this.cachingEnabled ? 'enabled' : 'disabled'}`)
    console.log('')
  }

  // Read the passed-tests file (restored from cache by the workflow
  // before this script runs). Returns a Set of test filenames. Empty
  // Set on miss / parse error — best-effort by design.
  loadPassedTests() {
    if (!this.cachingEnabled) return new Set()
    const file = process.env.NEXT_TEST_PASSED_FILE
    if (!file) return new Set()
    try {
      const data = fs.readFileSync(file, 'utf8')
      // The file is created (in append mode) before any test runs, so it's
      // empty when no test passed (or none ran at all) in the earlier
      // attempt.
      if (data === '') {
        return new Set()
      }
      // Tolerate a partial trailing line from a hard kill mid-append by
      // requiring an explicit '\0' terminator. Lines without it are
      // dropped.
      const lines = data.split('\0')
      return new Set(data.endsWith('\0') ? lines : lines.slice(0, -1))
    } catch (err) {
      // ENOENT is the normal "no prior attempt" path — silent.
      if (err && err.code !== 'ENOENT') {
        console.log(`Test result cache: failed to load (${err.message})`)
      }
      return new Set()
    }
  }
}

// Do not rename or format. sync-react script relies on this line.
// prettier-ignore
const nextjsReactPeerVersion = "19.3.1";

let argv = require('yargs/yargs')(process.argv.slice(2))
  .string('type')
  .string('test-pattern')
  .string('suite-list')
  .describe(
    'suite-list',
    'JSON file of {file, testNamePattern?} suite selections'
  )
  .string('jest-args')
  .describe('jest-args', 'JSON array of additional Jest arguments')
  .boolean('timings')
  .boolean('write-timings')
  .number('retries')
  .number('runs')
  .describe(
    'runs',
    'Total runs per selected suite, sharing the concurrency limit (default: 1)'
  )
  .boolean('debug')
  .string('g')
  .alias('g', 'group')
  .number('c')
  .boolean('dry')
  .boolean('print-tests')
  .describe('print-tests', 'Prints the test files that will be run')
  .boolean('require-timings')
  .describe(
    'require-timings',
    'Require test-timings.json from disk; fail if missing instead of falling back to KV or round-robin'
  )
  .boolean('local')
  .alias('c', 'concurrency').argv

function escapeRegexp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @typedef {{ file: string, excludedCases: string[], testNamePattern?: string }} TestFile
 * @typedef {TestFile & { runNumber: number }} TestRun
 */

const GROUP = process.env.CI ? '##[group]' : ''
const ENDGROUP = process.env.CI ? '##[endgroup]' : ''

const externalTestsFilter = getTestFilter()

const timings = []
const DEFAULT_NUM_RETRIES = 2
const DEFAULT_CONCURRENCY = 2
const RESULTS_EXT = `.results.json`
const isTestJob = !!process.env.NEXT_TEST_JOB
const KV_TIMINGS_KEY = 'test-timings'

const kvClient =
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
    ? createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      })
    : null

/**
 * Retry a KV operation with exponential backoff
 * @param {() => Promise<any>} operation - The async operation to retry
 * @param {string} operationName - Name of the operation for logging
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @returns {Promise<any>} The result of the operation
 */
async function retryKVOperation(operation, operationName, maxRetries = 3) {
  let lastError
  let retries = maxRetries

  while (retries > 0) {
    try {
      return await operation()
    } catch (err) {
      lastError = err
      retries--
      if (retries > 0) {
        const delay = (maxRetries - retries + 1) * 5 // 5s, 10s, 15s backoff
        console.log(
          `KV ${operationName} failed, retrying in ${delay}s. Error:`,
          err.message
        )
        await new Promise((resolve) => setTimeout(resolve, delay * 1000))
      }
    }
  }

  throw new Error(
    `Failed to ${operationName} after ${maxRetries} retries: ${lastError?.message}`
  )
}

const testFilters = {
  development: new RegExp('^(test/(development|e2e))'),
  production: new RegExp('^(test/(production|e2e))'),
  unit: new RegExp('^(test/unit|packages/.*/src|packages/next-codemod)'),
  e2e: 'test/e2e/',
}

const mockTrace = () => ({
  traceAsyncFn: (fn) => fn(mockTrace()),
  traceFn: (fn) => fn(mockTrace()),
  traceChild: () => mockTrace(),
})

// which types we have configured to run separate
// `examples/` additionally excludes test files inside example apps, which run
// with each example's own jest/vitest setup instead of this runner.
const configuredTestTypes = [...Object.values(testFilters), 'examples/']
// The run ID prevents a passing run from clearing another run's failure.
/** @type {Map<string, { file: string, output: string, failedCases: string[] }>} */
const errorsPerTests = new Map()

// GitHub drops the whole job summary of a step if it exceeds 1MiB:
// https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary
const MAX_SUMMARY_BYTES = 1024 * 1024
const SUMMARY_TRUNCATION_NOTICE =
  '\n\n... truncated to fit the job summary size limit ...'

// Strip terminal color/control codes before writing output to the job
// summary. Mirrors `scripts/pr-ci-comment.mjs`.
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /(?:\u001B\][\s\S]*?(?:\u0007|\u001B\\|\u009C))|(?:[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/g

// The head commit of this CI run. `GITHUB_SHA` is the merge commit for
// pull requests, but Datadog test runs and the PR test report comment use
// the PR head commit, so prefer that when available.
function getHeadSha() {
  if (process.env.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(
        fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')
      )
      const headSha = event.pull_request?.head?.sha
      if (headSha) {
        return headSha
      }
    } catch (err) {
      console.log('Failed to read the head SHA from the event payload', err)
    }
  }
  return process.env.GITHUB_SHA ?? null
}

// Write a job summary using the same printer as the PR test report comment
// (`scripts/pr-ci-comment.mjs`), so a truncated comment can refer to the job
// summary for the full report.
async function maybeLogSummary() {
  if (process.env.CI && errorsPerTests.size > 0) {
    const sha = getHeadSha()
    const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/')

    const suites = [...errorsPerTests.keys()].sort().map((testRunId) => {
      const { file, output, failedCases } = errorsPerTests.get(testRunId)
      return {
        testPath: file,
        mode: process.env.NEXT_TEST_MODE,
        isTurbopack: !!process.env.IS_TURBOPACK_TEST,
        isRspack: !!process.env.NEXT_RSPACK,
        isExperimental: process.env.__NEXT_CACHE_COMPONENTS === 'true',
        isPPR: process.env.__NEXT_EXPERIMENTAL_PPR === 'true',
        failedCases,
        resultMessage: ['```', output.replace(ANSI_RE, ''), '```'].join('\n'),
      }
    })

    let summary = buildTestReport({
      owner,
      repo,
      sha,
      suites,
    })

    if (Buffer.byteLength(summary, 'utf8') > MAX_SUMMARY_BYTES) {
      const truncated = Buffer.from(summary, 'utf8')
        .subarray(
          0,
          MAX_SUMMARY_BYTES - Buffer.byteLength(SUMMARY_TRUNCATION_NOTICE)
        )
        .toString('utf8')
        // A multi-byte character cut at the boundary decodes to U+FFFD.
        .replace(/�$/, '')
      summary = truncated + SUMMARY_TRUNCATION_NOTICE
    }

    await core.summary.addRaw(summary).write()
  }
}

let exiting = false

/**
 * Browser server shared across all test suites. Suites connect to it via
 * `test/lib/browsers/playwright.ts` instead of each launching their own
 * browser process.
 * @type {import('playwright').BrowserServer | undefined}
 */
let sharedBrowserServer

/**
 * @type {string | undefined}
 */
let testRunsDirectory
/** @type {string | undefined} */
let suiteResultsDirectory

const cleanUpAndExit = async (code) => {
  if (exiting) {
    return
  }
  exiting = true
  console.log(`exiting with code ${code}`)

  if (sharedBrowserServer) {
    await sharedBrowserServer.close().catch((err) => {
      console.error('Failed to close shared browser server:', err)
    })
  }
  if (process.env.NEXT_TEST_STARTER) {
    await fsp.rm(process.env.NEXT_TEST_STARTER, {
      recursive: true,
      force: true,
    })
  }
  if (testRunsDirectory && !process.env.NEXT_TEST_SKIP_CLEANUP) {
    await fsp.rm(testRunsDirectory, { recursive: true, force: true })
  }
  if (suiteResultsDirectory) {
    await fsp.rm(suiteResultsDirectory, { recursive: true, force: true })
  }
  if (process.env.CI) {
    await maybeLogSummary()
  }
  process.exit(code)
}

const isMatchingPattern = (pattern, file) => {
  if (pattern instanceof RegExp) {
    return pattern.test(file)
  } else {
    return file.startsWith(pattern)
  }
}

async function getTestTimings() {
  if (!kvClient) {
    console.warn('KV client not configured, skipping timing fetch')
    return null
  }

  const timings = await retryKVOperation(async () => {
    const data = await kvClient.get(KV_TIMINGS_KEY)
    if (!data) {
      console.log('No timing data found in KV store')
    }
    return data
  }, 'fetch timings')
  return timings || null
}

async function main() {
  // Ensure we have the arguments awaited from yargs.
  argv = await argv

  // `.github/workflows/build_reusable.yml` sets this, we should use it unless
  // it's overridden by an explicit `--concurrency` argument.
  const envConcurrency =
    process.env.TEST_CONCURRENCY && parseInt(process.env.TEST_CONCURRENCY, 10)

  const options = {
    concurrency: argv.concurrency ?? envConcurrency ?? DEFAULT_CONCURRENCY,
    debug: argv.debug ?? core.isDebug(),
    timings: argv.timings ?? false,
    writeTimings: argv.writeTimings ?? false,
    group: argv.group ?? false,
    testPattern: argv.testPattern ?? false,
    type: argv.type ?? false,
    retries: argv.retries ?? DEFAULT_NUM_RETRIES,
    runCount: argv.runs ?? 1,
    requireTimings: argv.requireTimings ?? false,
    dry: argv.dry ?? false,
    local: argv.local ?? false,
    printTests: argv.printTests ?? false,
  }
  const jestArgs = JSON.parse(argv['jest-args'] ?? '[]')
  if (
    !Array.isArray(jestArgs) ||
    jestArgs.some((arg) => typeof arg !== 'string')
  ) {
    throw new Error('--jest-args must be a JSON array of strings')
  }
  // A developer's name filter narrows a focused suite; it must not replace
  // the suite's routing-only selection and enable unrelated assertions.
  const namePatterns = []
  const forwardedJestArgs = []
  for (let index = 0; index < jestArgs.length; index++) {
    const match =
      /^(?:--testNamePattern|--test-name-pattern|-t)(?:=(.*))?$/.exec(
        jestArgs[index]
      ) ?? /^-t(.+)$/.exec(jestArgs[index])
    if (match) {
      const pattern = match[1] ?? jestArgs[++index]
      if (typeof pattern !== 'string') {
        throw new Error('A Jest testNamePattern needs a value')
      }
      new RegExp(pattern)
      namePatterns.push(pattern)
    } else {
      forwardedJestArgs.push(jestArgs[index])
    }
  }
  let numRetries = options.retries
  if (!Number.isSafeInteger(options.runCount) || options.runCount < 1) {
    throw new Error('--runs must be a positive integer')
  }
  if (options.runCount > 1 && process.env.NEXT_SKIP_ISOLATE) {
    throw new Error(
      'Multiple runs of a suite require isolated test fixtures; unset NEXT_SKIP_ISOLATE'
    )
  }
  const hideOutput = !options.debug && !options.dry

  let filterTestsBy

  switch (options.type) {
    case 'unit': {
      numRetries = 0
      filterTestsBy = testFilters.unit
      break
    }
    case 'all': {
      filterTestsBy = 'none'
      break
    }
    default: {
      filterTestsBy = testFilters[options.type]
      break
    }
  }

  if (options.runCount > 1 && numRetries !== 0) {
    // Retry cleanup resets the suite's files in the shared checkout.
    // Other runs may still need those files.
    throw new Error('Multiple runs of a suite require --retries 0')
  }

  console.log(
    'Running tests with concurrency:',
    options.concurrency,
    'in test mode',
    process.env.NEXT_TEST_MODE
  )

  const profile = new TestProfile({
    group: String(options.group || ''),
    type: String(options.type || ''),
    testPattern: String(options.testPattern || ''),
    runCount: options.runCount,
  })
  profile.log()

  // Only fetch/update shared timing data during grouped CI runs to avoid
  // individual test runs from polluting the timing data
  const shouldUseSharedTimings =
    options.timings && options.group && options.runCount === 1

  /** @type TestFile[] */
  let tests = argv._.filter((arg) =>
    arg.toString().match(/\.test\.(js|ts|tsx)/)
  ).map((file) => ({ file: file.toString(), excludedCases: [] }))
  if (argv['suite-list']) {
    const selections = JSON.parse(
      await fsp.readFile(argv['suite-list'], 'utf8')
    )
    if (
      !Array.isArray(selections) ||
      selections.length === 0 ||
      selections.some(
        (selection) =>
          typeof selection.file !== 'string' ||
          !/\.test\.[jt]sx?$/.test(selection.file) ||
          (selection.testNamePattern !== undefined &&
            (typeof selection.testNamePattern !== 'string' ||
              selection.testNamePattern.length === 0))
      )
    ) {
      throw new Error('--suite-list must contain nonempty suite selections')
    }
    for (const selection of selections) {
      if (selection.testNamePattern) new RegExp(selection.testNamePattern)
    }
    tests = selections.map((selection) => ({ ...selection, excludedCases: [] }))
  }
  let prevTimings

  if (tests.length === 0) {
    /** @type {RegExp | undefined} */
    let testPatternRegex

    if (options.testPattern && typeof options.testPattern === 'string') {
      testPatternRegex = new RegExp(options.testPattern)
    }

    tests = (
      await glob('**/*.test.{js,ts,tsx}', {
        nodir: true,
        cwd: __dirname,
        ignore: '**/node_modules/**',
      })
    )
      .filter((file) => {
        if (testPatternRegex) {
          return testPatternRegex.test(file)
        }
        if (filterTestsBy) {
          // only include the specified type
          if (filterTestsBy === 'none') {
            return true
          }
          return isMatchingPattern(filterTestsBy, file)
        }
        // include all except the separately configured types
        return !configuredTestTypes.some((type) =>
          isMatchingPattern(type, file)
        )
      })
      .map((file) => ({
        file,
        excludedCases: [],
      }))

    //
  }

  if (shouldUseSharedTimings) {
    console.log('Fetching previous timings data')
    const timingsFile = path.join(process.cwd(), 'test-timings.json')

    try {
      prevTimings = JSON.parse(await fsp.readFile(timingsFile, 'utf8'))
      console.log('Loaded test timings from disk successfully')
    } catch (_) {
      if (options.requireTimings) {
        console.error(
          'ERROR: --require-timings is set but test-timings.json could not be loaded from disk:',
          _
        )
        await cleanUpAndExit(1)
        return
      }
      console.error(
        'Failed to load test timings from disk. Proceeding to fetch from KV store. Original error: ',
        _
      )
    }

    if (!prevTimings && !options.requireTimings) {
      try {
        prevTimings = await getTestTimings()
        if (prevTimings) {
          console.log('Fetched previous timings data successfully from KV')
        } else {
          console.log('No previous timings data available')
        }
      } catch (kvError) {
        console.warn(
          'Failed to fetch timings from KV, continuing without timing data:',
          kvError.message
        )
        prevTimings = null
      }

      if (options.writeTimings) {
        if (prevTimings) {
          await fsp.writeFile(timingsFile, JSON.stringify(prevTimings))
          console.log('Wrote previous timings data to', timingsFile)
        } else {
          console.log('No timings data to write')
        }
        await cleanUpAndExit(0)
      }
    }
  }

  // If there are external manifest contains list of tests, apply it to the test lists.
  if (externalTestsFilter) {
    tests = externalTestsFilter(tests)
  }

  let testSet = new Set()
  tests = tests
    .map((test) => {
      test.file = test.file.replace(/\\/g, '/').replace(/\/test$/, '')
      return test
    })
    .filter((test) => {
      if (testSet.has(test.file)) return false
      testSet.add(test.file)
      return true
    })

  if (options.group && typeof options.group === 'string') {
    const groupParts = options.group.split('/')
    const groupPos = parseInt(groupParts[0], 10)
    const groupTotal = parseInt(groupParts[1], 10)

    if (prevTimings) {
      /** @type {TestFile[][]} */
      const groups = [[]]
      const groupTimes = [0]

      for (const test of tests) {
        let smallestGroup = groupTimes[0]
        let smallestGroupIdx = 0

        // get the smallest group time to add current one to
        for (let i = 1; i < groupTotal; i++) {
          if (!groups[i]) {
            groups[i] = []
            groupTimes[i] = 0
          }

          const time = groupTimes[i]
          if (time < smallestGroup) {
            smallestGroup = time
            smallestGroupIdx = i
          }
        }
        groups[smallestGroupIdx].push(test)
        groupTimes[smallestGroupIdx] += prevTimings[test.file] || 1
      }

      const curGroupIdx = groupPos - 1
      tests = groups[curGroupIdx]

      console.log(
        'Current group previous accumulated times:',
        Math.round(groupTimes[curGroupIdx]) + 's'
      )
    } else {
      if (options.requireTimings) {
        console.error(
          'ERROR: --require-timings is set but no timing data is available for sharding. ' +
            'Ensure test-timings.json is provided.'
        )
        await cleanUpAndExit(1)
        return
      }

      // assign every nth test "round-robin" to the group, so that similar slow
      // tests tend not to get clustered together
      tests = tests.filter((_value, idx) => idx % groupTotal === groupPos - 1)
      console.log('Splitting without timings')

      // Warn in CI that tests are not optimally distributed
      if (process.env.GITHUB_ACTIONS) {
        core.warning(
          `Test timing data unavailable for group ${options.group}. Tests are being distributed round-robin, which may increase CI time. ` +
            `Consider checking KV store connectivity if this persists.`
        )
      }
    }
  }

  if (!tests) {
    tests = []
  }

  if (tests.length === 0) {
    console.log('No tests found for', options.type, 'exiting..')
  }

  console.log(`${GROUP}Running tests:
${tests.map((t) => t.file).join('\n')}
${ENDGROUP}`)
  console.log(`total: ${tests.length}`)

  if (options.printTests) {
    await cleanUpAndExit(0)
  }
  if (argv['suite-list'] && !options.dry) {
    suiteResultsDirectory = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'next-suite-results-')
    )
  }

  if (
    !options.dry &&
    process.env.NEXT_TEST_MODE !== 'deploy' &&
    ((options.type && options.type !== 'unit') ||
      tests.some((test) => !testFilters.unit.test(test.file)))
  ) {
    // For isolated next tests (e2e, dev, prod) we create a starter Next.js
    // install to re-use to speed up tests to avoid having to run `pnpm install`
    // each time.
    console.log(`${GROUP}Creating shared Next.js install`)
    const reactVersion =
      process.env.NEXT_TEST_REACT_VERSION || nextjsReactPeerVersion
    const { installDir, pkgPaths } = await createNextInstall({
      parentSpan: mockTrace(),
      dependencies: {
        react: reactVersion,
        'react-dom': reactVersion,
      },
    })

    const serializedPkgPaths = []

    for (const key of pkgPaths.keys()) {
      serializedPkgPaths.push([key, pkgPaths.get(key)])
    }
    process.env.NEXT_TEST_PKG_PATHS = JSON.stringify(serializedPkgPaths)
    process.env.NEXT_TEST_STARTER = installDir
    console.log(`${ENDGROUP}`)
  }

  // best-effort, don't spawn a browser for unit tests, if we don't spawn a
  // browser but should've, that's okay, `next-webdriver` will still set it up
  if (
    !options.dry &&
    ((options.type && options.type !== 'unit') ||
      tests.some((test) => !testFilters.unit.test(test.file)))
  ) {
    // Launch a single browser server shared by all test suites, instead of
    // each suite launching its own browser process. Suites connect to it via
    // the ws endpoint env var in `test/lib/browsers/playwright.ts`.
    const { browserType, launchOptions } = getBrowserLaunch(
      process.env.BROWSER_NAME || 'chrome',
      { headless: true } // matches per-test env below
    )
    sharedBrowserServer = await browserType.launchServer(launchOptions)
    process.env.NEXT_TEST_BROWSER_WS_ENDPOINT = sharedBrowserServer.wsEndpoint()
  }

  // Expand after sharding so all runs of each suite share a runner and browser.
  const testRuns = tests.flatMap((test) =>
    Array.from({ length: options.runCount }, (_, index) => ({
      ...test,
      runNumber: index + 1,
    }))
  )

  if (options.runCount > 1 && !options.dry) {
    testRunsDirectory = await fsp.mkdtemp(
      path.join(process.env.NEXT_TEST_DIR || os.tmpdir(), 'next-test-runs-')
    )
  }

  const sema = new Sema(options.concurrency, { capacity: testRuns.length })
  const outputSema = new Sema(1, { capacity: testRuns.length })
  const children = new Set()
  const jestPath = path.join(
    __dirname,
    'node_modules',
    '.bin',
    `jest${process.platform === 'win32' ? '.CMD' : ''}`
  )
  let firstError = true
  let hadFailures = false
  const selectedCounts = { passed: 0, failed: 0, pending: 0 }

  /**
   * @param {TestRun} testRun
   */
  const getTestRunId = (testRun) =>
    options.runCount === 1
      ? testRun.file
      : `${testRun.file}.run-${testRun.runNumber}`

  /**
   * @param {TestRun} testRun
   */
  const getTestRunLabel = (testRun) =>
    options.runCount === 1
      ? testRun.file
      : `${testRun.file} (run ${testRun.runNumber}/${options.runCount})`

  /**
   * @param {TestRun} testRun
   */
  const getTraceDirectory = (testRun) =>
    path.join(
      __dirname,
      'test/traces',
      path
        .relative(path.join(__dirname, 'test'), testRun.file)
        .replace(/\//g, '-'),
      ...(options.runCount === 1 ? [] : [`run-${testRun.runNumber}`])
    )

  const runTestOnce = (
    /** @type {TestRun} */ testRun,
    isFinalRun,
    isRetry,
    /** @type {string | undefined} */ testDirectory
  ) =>
    new Promise((resolve, reject) => {
      const start = new Date().getTime()
      let outputChunks = []
      const resultsFile = isTestJob
        ? `${getTestRunId(testRun)}${RESULTS_EXT}`
        : suiteResultsDirectory
          ? path.join(
              suiteResultsDirectory,
              `${createHash('sha256').update(testRun.file).digest('hex')}.${testRun.runNumber}.json`
            )
          : undefined
      const includePatterns = [
        ...(testRun.testNamePattern ? [testRun.testNamePattern] : []),
        ...namePatterns,
      ]

      const args = [
        ...(process.env.CI ? ['--ci'] : []),
        '--runInBand',
        '--forceExit',
        '--no-cache',
        '--verbose',
        ...(resultsFile ? ['--json', `--outputFile=${resultsFile}`] : []),
        ...(argv['suite-list'] ? ['--runTestsByPath'] : []),
        testRun.file,
        ...(includePatterns.length === 0 && testRun.excludedCases.length === 0
          ? []
          : [
              '--testNamePattern',
              `^(?!(?:${testRun.excludedCases.map(escapeRegexp).join('|')})$)${includePatterns.map((pattern) => `(?=.*(?:${pattern}))`).join('')}.`,
            ]),
        ...forwardedJestArgs,
      ]
      const deferNextTestWasm = !!process.env.NEXT_TEST_WASM
      const env = {
        // run tests in headless mode by default
        HEADLESS: 'true',
        NEXT_TELEMETRY_DISABLED: '1',
        // unset CI env so CI behavior is only explicitly
        // tested when enabled
        CI: '',
        // But some tests need to fork based on machine? CI? behavior differences
        // Only use this in tests.
        // For implementation forks, use `process.env.CI` instead
        NEXT_TEST_CI: process.env.CI,
        ...(options.runCount > 1
          ? {
              NEXT_TEST_RUN_NUMBER: String(testRun.runNumber),
              NEXT_TEST_DIR: testDirectory,
            }
          : {}),

        ...(options.local
          ? {}
          : {
              IS_RETRY: isRetry ? 'true' : undefined,
              TRACE_PLAYWRIGHT: 'true',
              CIRCLECI: '',
              GITHUB_ACTIONS: '',
              CONTINUOUS_INTEGRATION: '',
              RUN_ID: '',
              BUILD_NUMBER: '',
              // Format the output of junit report to include the test name
              // For the debugging purpose to compare actual run list to the generated reports
              // [NOTE]: This won't affect if junit reporter is not enabled
              JEST_JUNIT_OUTPUT_NAME: getTestRunId(testRun).replaceAll(
                '/',
                '_'
              ),
              // Specify suite name for the test to avoid unexpected merging across different env / grouped tests
              // This is not individual suites name (corresponding 'describe'), top level suite name which have redundant names by default
              // [NOTE]: This won't affect if junit reporter is not enabled
              JEST_SUITE_NAME: [
                `${process.env.NEXT_TEST_MODE ?? 'default'}`,
                options.group,
                options.type,
                testRun.file,
                ...(options.runCount > 1 ? [`run-${testRun.runNumber}`] : []),
              ]
                .filter(Boolean)
                .join(':'),
            }),
        ...(deferNextTestWasm
          ? {
              // Let Next/Jest initialize native SWC for the transformer first.
              NEXT_TEST_WASM: undefined,
              NEXT_TEST_WASM_AFTER_JEST: process.env.NEXT_TEST_WASM,
            }
          : {}),
        ...(isFinalRun
          ? {
              // Events can be finicky in CI. This switches to a more
              // reliable polling method.
              // CHOKIDAR_USEPOLLING: 'true',
              // CHOKIDAR_INTERVAL: 500,
              // WATCHPACK_POLLING: 500,
            }
          : {}),
      }

      const handleOutput = (type) => (chunk) => {
        if (hideOutput) {
          outputChunks.push({ type, chunk })
        } else {
          process.stdout.write(chunk)
        }
      }
      const stdout = handleOutput('stdout')
      stdout(
        [
          ...Object.entries(env).map((e) => `${e[0]}=${e[1]}`),
          jestPath,
          ...args.map((a) => `'${a}'`),
        ].join(' ') + '\n'
      )

      // Don't execute tests when in dry run mode
      if (options.dry) {
        return resolve(new Date().getTime() - start)
      }

      const spawnTest = argv['suite-list'] ? crossSpawn : spawn
      const child = spawnTest(jestPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...env,
        },
        // cross-spawn handles .cmd execution and quotes focused regexes on
        // Windows. Keep the existing launch behavior for other callers.
        // See: https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2
        shell: argv['suite-list'] ? false : process.platform === 'win32',
      })
      child.stdout.on('data', stdout)
      child.stderr.on('data', handleOutput('stderr'))

      children.add(child)

      child.on('exit', async (code, signal) => {
        children.delete(child)
        if (suiteResultsDirectory && resultsFile) {
          try {
            const report = JSON.parse(await fsp.readFile(resultsFile, 'utf8'))
            const pattern = testRun.testNamePattern
              ? new RegExp(testRun.testNamePattern)
              : undefined
            const assertions = report.testResults.flatMap(
              (result) => result.assertionResults
            )
            const selectedAssertions = assertions.filter(
              (assertion) => !pattern || pattern.test(assertion.fullName)
            )
            // A renamed assertion must not silently turn a focused selection
            // into an entirely filtered-out, successful Jest run. Registered
            // but mode-gated tests still count as a valid selection.
            if (pattern && selectedAssertions.length === 0 && code === 0) {
              return reject(
                new Error(
                  `No test names match the routing selection in ${testRun.file}`
                )
              )
            }
            for (const assertion of selectedAssertions) {
              if (assertion.status in selectedCounts) {
                selectedCounts[assertion.status]++
              }
            }
          } catch (error) {
            if (code === 0) return reject(error)
          }
        }
        const isChildExitWithNonZero = code !== 0 || signal !== null
        if (isChildExitWithNonZero) {
          if (hideOutput) {
            await outputSema.acquire()
            const isExpanded = firstError
            if (isExpanded) {
              firstError = false
              process.stdout.write(`❌ ${getTestRunLabel(testRun)} output:\n`)
            } else {
              process.stdout.write(
                `${GROUP}❌ ${getTestRunLabel(testRun)} output\n`
              )
            }

            let output = ''
            // limit out to last 64kb so that we don't
            // run out of log room in CI
            for (const { chunk } of outputChunks) {
              process.stdout.write(chunk)
              output += chunk.toString()
            }

            if (process.env.CI) {
              errorsPerTests.set(getTestRunId(testRun), {
                file: testRun.file,
                output,
                failedCases: [],
              })
            }

            if (isExpanded) {
              process.stdout.write(
                `end of ${getTestRunLabel(testRun)} output\n`
              )
            } else {
              process.stdout.write(
                `end of ${getTestRunLabel(testRun)} output\n${ENDGROUP}\n`
              )
            }
            outputSema.release()
          }
          const err = new Error(
            code ? `failed with code: ${code}` : `failed with signal: ${signal}`
          )
          // @ts-expect-error
          err.output = outputChunks
            .map(({ chunk }) => chunk.toString())
            .join('')

          return reject(err)
        }

        // preserve test traces to upload into github actions artifacts for debugging purposes
        const shouldPreserveTracesOutput =
          (process.env.CI && isChildExitWithNonZero) ||
          process.env.PRESERVE_TRACES_OUTPUT
        if (!shouldPreserveTracesOutput) {
          await fsp
            .rm(getTraceDirectory(testRun), { recursive: true, force: true })
            .catch(() => {})
        }

        resolve(new Date().getTime() - start)
      })
    })

  const isRetryAttempt =
    process.env.CI && parseInt(process.env.GITHUB_RUN_ATTEMPT || '1', 10) > 1

  // Load tests that already passed (either on this attempt — restored
  // from cache by the workflow — or after a timeout/cancel of an earlier
  // attempt). The workflow's `actions/cache/restore` step lands the file
  // at the path `loadPassedTests` reads.
  let cachedPassedTests = new Set()
  if (process.env.CI) {
    cachedPassedTests = await profile.loadPassedTests()
    if (cachedPassedTests.size > 0) {
      console.log(
        `Test result cache: loaded ${cachedPassedTests.size} passed test(s) (${profile.description})`
      )
    } else if (isRetryAttempt) {
      console.log(`Test result cache: miss (${profile.description})`)
    }
  }

  // Stream passing test names to this file.
  /** @type {number | null} */
  let passedTestsFd = null
  if (profile.cachingEnabled) {
    try {
      passedTestsFd = fs.openSync(process.env.NEXT_TEST_PASSED_FILE, 'a')
      // Tell the workflow that the file exists. Its "Save passed-tests
      // cache" step (see `.github/workflows/build_reusable.yml`) only runs
      // when this output is present, so jobs that never get here (no
      // run-tests.js, or result caching disabled) skip the save instead of
      // warning about a missing path.
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(
          process.env.GITHUB_OUTPUT,
          `passed_tests_file=${process.env.NEXT_TEST_PASSED_FILE}\n`
        )
      }
    } catch (err) {
      console.log(`Test result cache: open failed (${err.message})`)
    }
  }
  /** @param {string} file */
  const recordPassed = (file) => {
    if (passedTestsFd === null) return
    try {
      // Ensure durability of our writes by syncing each one.
      // This is a tiny bit of overhead but shouldn't really matter.
      fs.writeSync(passedTestsFd, `${file}\0`)
      fs.fdatasyncSync(passedTestsFd)
    } catch (err) {
      console.log(`Test result cache: append failed (${err.message})`)
    }
  }

  const runTest = async (/** @type {TestRun} */ testRun) => {
    const testDirectory = testRunsDirectory
      ? await fsp.mkdtemp(path.join(testRunsDirectory, 'run-'))
      : undefined
    // On CI retry attempts, skip tests that already passed on this commit
    if (cachedPassedTests.has(testRun.file)) {
      console.log(
        `${testRun.file} already passed on this commit (cached) — skipping`
      )
      return
    }

    let passed = false

    for (let i = 0; i < numRetries + 1; i++) {
      try {
        console.log(
          `Starting ${getTestRunLabel(testRun)} retry ${i}/${numRetries}`
        )
        const time = await runTestOnce(
          testRun,
          i === numRetries,
          i > 0,
          testDirectory
        )
        timings.push({
          file: testRun.file,
          time,
        })
        passed = true
        console.log(
          `${getTestRunLabel(testRun)} finished on retry ${i}/${numRetries} in ${time / 1000}s`
        )
        break
      } catch (err) {
        if (i < numRetries) {
          try {
            let testDir = path.dirname(path.join(__dirname, testRun.file))

            // if test is nested in a test folder traverse up a dir to ensure
            // we clean up relevant test files
            if (testDir.endsWith('/test') || testDir.endsWith('\\test')) {
              testDir = path.join(testDir, '..')
            }
            console.log('Cleaning test files at', testDir)
            await exec(`git clean -fdx "${testDir}"`)
            await exec(`git checkout "${testDir}"`)
          } catch (err) {}
        } else {
          console.error(`${getTestRunLabel(testRun)} failed due to ${err}`)
        }
      }
    }

    if (passed) {
      recordPassed(testRun.file)
      // The test may have failed on an earlier attempt; don't report tests
      // that ultimately passed in the job summary.
      errorsPerTests.delete(getTestRunId(testRun))
    }

    if (!passed) {
      hadFailures = true
      // "failed to pass within" is a keyword parsed by next-pr-webhook
      console.error(
        `${testRun.file} failed to pass within ${numRetries} retries`
      )
    }

    // Emit test output, parsed by the commenter webhook to notify about failing tests.
    // Also emit for all tests when NEXT_TEST_EMIT_ALL_OUTPUT is set (for manifest generation).
    if ((!passed || process.env.NEXT_TEST_EMIT_ALL_OUTPUT) && isTestJob) {
      try {
        const testsOutput = await fsp.readFile(
          `${getTestRunId(testRun)}${RESULTS_EXT}`,
          'utf8'
        )
        const obj = JSON.parse(testsOutput)

        // Extract failed test case names from Jest JSON output
        if (!passed && process.env.CI) {
          const failedCases = []
          for (const testResult of obj.testResults || []) {
            for (const assertion of testResult.assertionResults || []) {
              if (assertion.status === 'failed') {
                const caseName = [
                  ...(assertion.ancestorTitles || []),
                  assertion.title,
                ].join(' > ')
                failedCases.push(caseName)
              }
            }
          }
          // Update errorsPerTests with failed case names
          const existing = errorsPerTests.get(getTestRunId(testRun))
          if (existing) {
            existing.failedCases = failedCases
          }
        }

        obj.processEnv = {
          NEXT_TEST_MODE: process.env.NEXT_TEST_MODE,
          HEADLESS: process.env.HEADLESS,
          ...(options.runCount > 1
            ? { NEXT_TEST_RUN_NUMBER: String(testRun.runNumber) }
            : {}),
        }
        await outputSema.acquire()
        if (GROUP) console.log(`${GROUP}Result as JSON for tooling`)
        console.log(
          `--test output start--`,
          JSON.stringify(obj),
          `--test output end--`
        )
        if (ENDGROUP) console.log(ENDGROUP)
        outputSema.release()
      } catch (err) {
        console.log(`Failed to load test output`, err)
      }
    }
  }

  const results = await Promise.allSettled(
    testRuns.map(async (testRun) => {
      // TODO: Use explicit resource management instead of this acquire/release
      // pattern once CI runs with Node.js 24+.
      await sema.acquire()

      try {
        await runTest(testRun)
      } finally {
        sema.release()
      }
    })
  )

  for (const result of results) {
    if (result.status === 'rejected') {
      hadFailures = true
      console.error(result.reason)
    }
  }

  if (passedTestsFd !== null) {
    try {
      fs.closeSync(passedTestsFd)
    } catch {}
  }
  if (suiteResultsDirectory) {
    console.log(
      `Selected assertions: ${selectedCounts.passed} passed, ${selectedCounts.failed} failed, ${selectedCounts.pending} skipped`
    )
  }

  if (cachedPassedTests.size > 0) {
    const skipped = tests.filter((t) => cachedPassedTests.has(t.file)).length
    if (skipped > 0) {
      console.log(
        `Test result cache: skipped ${skipped} cached, re-ran ${tests.length - skipped}`
      )
    }
  }

  if (options.timings) {
    const curTimings = {}
    // let junitData = `<testsuites name="jest tests">`
    /*
      <testsuite name="/__tests__/bar.test.js" tests="1" errors="0" failures="0" skipped="0" timestamp="2017-10-10T21:56:49" time="0.323">
        <testcase classname="bar-should be bar" name="bar-should be bar" time="0.004">
        </testcase>
      </testsuite>
    */

    for (const timing of timings) {
      const timeInSeconds = timing.time / 1000
      curTimings[timing.file] = timeInSeconds

      // junitData += `
      //   <testsuite name="${timing.file}" file="${
      //   timing.file
      // }" tests="1" errors="0" failures="0" skipped="0" timestamp="${new Date().toJSON()}" time="${timeInSeconds}">
      //     <testcase classname="tests suite should pass" name="${
      //       timing.file
      //     }" time="${timeInSeconds}"></testcase>
      //   </testsuite>
      // `
    }
    // junitData += `</testsuites>`
    // console.log('output timing data to junit.xml')

    if (shouldUseSharedTimings) {
      if (kvClient) {
        try {
          // Fetch existing timings and merge with new ones
          const existingTimings = (await getTestTimings()) || {}
          const newTimings = {
            ...existingTimings,
            ...curTimings,
          }

          // Clean up stale timings for deleted tests
          for (const test of Object.keys(newTimings)) {
            if (!fs.existsSync(path.join(__dirname, test))) {
              console.log('removing stale timing', test)
              delete newTimings[test]
            }
          }

          // Update KV store with retries
          await retryKVOperation(async () => {
            await kvClient.set(KV_TIMINGS_KEY, newTimings)
            console.log('Successfully updated test timings in KV store')
          }, 'update timings')
        } catch (err) {
          console.log('Failed to update timings data', err)
        }
      } else {
        console.warn('KV client not configured, skipping timing update')
      }
    }
  }

  return hadFailures
}

main().then(
  (hadFailures) => {
    if (hadFailures) {
      console.error('Some tests failed')
      return cleanUpAndExit(1)
    } else {
      return cleanUpAndExit(0)
    }
  },
  (reason) => {
    console.error(reason)
    return cleanUpAndExit(1)
  }
)
