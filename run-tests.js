//@ts-check

const path = require('path')
const _glob = require('glob')
const fs = require('fs')
const fsp = require('fs/promises')
const { createClient } = require('@vercel/kv')
const { promisify } = require('util')
const { Sema } = require('async-sema')
const { spawn, exec: execOrig } = require('child_process')
const { createNextInstall } = require('./test/lib/create-next-install')
const glob = promisify(_glob)
const exec = promisify(execOrig)
const core = require('@actions/core')
const { getTestFilter } = require('./test/get-test-filter')
const { checkBuildFreshness } = require('./test/lib/check-build-freshness')

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

  constructor({ group = '', type = '', testPattern = '' } = {}) {
    this.cachingEnabled = !!(
      process.env.CI &&
      process.env.GITHUB_SHA &&
      !process.env.NEXT_FLAKE_DETECTION &&
      !process.env.NEXT_TEST_SKIP_RESULT_CACHE
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
const nextjsReactPeerVersion = "19.2.7";

let argv = require('yargs/yargs')(process.argv.slice(2))
  .string('type')
  .string('test-pattern')
  .boolean('timings')
  .boolean('write-timings')
  .number('retries')
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
 * @typedef {{ file: string, excludedCases: string[] }} TestFile
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
  examples: 'examples/',
  e2e: 'test/e2e/',
}

const mockTrace = () => ({
  traceAsyncFn: (fn) => fn(mockTrace()),
  traceFn: (fn) => fn(mockTrace()),
  traceChild: () => mockTrace(),
})

// which types we have configured to run separate
const configuredTestTypes = Object.values(testFilters)
/** @type {Map<string, { output: string, failedCases: string[] }>} */
const errorsPerTests = new Map()

async function maybeLogSummary() {
  if (process.env.CI && errorsPerTests.size > 0) {
    const outputTemplate = `
${Array.from(errorsPerTests.entries())
  .map(([test, { output }]) => {
    return `
<details>
<summary>${test}</summary>

\`\`\`
${output}
\`\`\`

</details>
`
  })
  .join('\n')}`

    // Build table rows with one row per failed test case
    const tableRows = []
    for (const [test, { failedCases }] of errorsPerTests.entries()) {
      const testLink = `<a href="https://github.com/vercel/next.js/blob/canary/${test}">${test}</a>`
      if (failedCases.length === 0) {
        tableRows.push(['Unknown', testLink])
      } else {
        for (const caseName of failedCases) {
          tableRows.push([caseName, testLink])
        }
      }
    }

    await core.summary
      .addHeading('Tests failures')
      .addTable([
        [
          { data: 'Test Name', header: true },
          { data: 'Test Path', header: true },
        ],
        ...tableRows,
      ])
      .addRaw(outputTemplate)
      .write()
  }
}

let exiting = false

const cleanUpAndExit = async (code) => {
  if (exiting) {
    return
  }
  exiting = true
  console.log(`exiting with code ${code}`)

  if (process.env.NEXT_TEST_STARTER) {
    await fsp.rm(process.env.NEXT_TEST_STARTER, {
      recursive: true,
      force: true,
    })
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

  // Check for stale or missing build
  await checkBuildFreshness()

  // `.github/workflows/build_reusable.yml` sets this, we should use it unless
  // it's overridden by an explicit `--concurrency` argument.
  const envConcurrency =
    process.env.TEST_CONCURRENCY && parseInt(process.env.TEST_CONCURRENCY, 10)

  const options = {
    concurrency: argv.concurrency ?? envConcurrency ?? DEFAULT_CONCURRENCY,
    debug: argv.debug ?? false,
    timings: argv.timings ?? false,
    writeTimings: argv.writeTimings ?? false,
    group: argv.group ?? false,
    testPattern: argv.testPattern ?? false,
    type: argv.type ?? false,
    retries: argv.retries ?? DEFAULT_NUM_RETRIES,
    requireTimings: argv.requireTimings ?? false,
    dry: argv.dry ?? false,
    local: argv.local ?? false,
    printTests: argv.printTests ?? false,
  }
  let numRetries = options.retries
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
  })
  profile.log()

  // Only fetch/update shared timing data during grouped CI runs to avoid
  // individual test runs from polluting the timing data
  const shouldUseSharedTimings = options.timings && options.group

  /** @type TestFile[] */
  let tests = argv._.filter((arg) =>
    arg.toString().match(/\.test\.(js|ts|tsx)/)
  ).map((file) => ({ file: file.toString(), excludedCases: [] }))
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

  const sema = new Sema(options.concurrency, { capacity: tests.length })
  const outputSema = new Sema(1, { capacity: tests.length })
  const children = new Set()
  const jestPath = path.join(
    __dirname,
    'node_modules',
    '.bin',
    `jest${process.platform === 'win32' ? '.CMD' : ''}`
  )
  let firstError = true
  let hadFailures = false

  const runTestOnce = (/** @type {TestFile} */ test, isFinalRun, isRetry) =>
    new Promise((resolve, reject) => {
      const start = new Date().getTime()
      let outputChunks = []

      const args = [
        ...(process.env.CI ? ['--ci'] : []),
        '--runInBand',
        '--forceExit',
        '--no-cache',
        '--verbose',
        ...(isTestJob
          ? ['--json', `--outputFile=${test.file}${RESULTS_EXT}`]
          : []),
        test.file,
        ...(test.excludedCases.length === 0
          ? []
          : [
              '--testNamePattern',
              `^(?!(?:${test.excludedCases.map(escapeRegexp).join('|')})$).`,
            ]),
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
              JEST_JUNIT_OUTPUT_NAME: test.file.replaceAll('/', '_'),
              // Specify suite name for the test to avoid unexpected merging across different env / grouped tests
              // This is not individual suites name (corresponding 'describe'), top level suite name which have redundant names by default
              // [NOTE]: This won't affect if junit reporter is not enabled
              JEST_SUITE_NAME: [
                `${process.env.NEXT_TEST_MODE ?? 'default'}`,
                options.group,
                options.type,
                test.file,
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

      const child = spawn(jestPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...env,
        },
        // See: https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2
        shell: process.platform === 'win32',
      })
      child.stdout.on('data', stdout)
      child.stderr.on('data', handleOutput('stderr'))

      children.add(child)

      child.on('exit', async (code, signal) => {
        children.delete(child)
        const isChildExitWithNonZero = code !== 0 || signal !== null
        if (isChildExitWithNonZero) {
          if (hideOutput) {
            await outputSema.acquire()
            const isExpanded = firstError
            if (isExpanded) {
              firstError = false
              process.stdout.write(`❌ ${test.file} output:\n`)
            } else {
              process.stdout.write(`${GROUP}❌ ${test.file} output\n`)
            }

            let output = ''
            // limit out to last 64kb so that we don't
            // run out of log room in CI
            for (const { chunk } of outputChunks) {
              process.stdout.write(chunk)
              output += chunk.toString()
            }

            if (process.env.CI) {
              errorsPerTests.set(test.file, { output, failedCases: [] })
            }

            if (isExpanded) {
              process.stdout.write(`end of ${test.file} output\n`)
            } else {
              process.stdout.write(`end of ${test.file} output\n${ENDGROUP}\n`)
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
            .rm(
              path.join(
                __dirname,
                'test/traces',
                path
                  .relative(path.join(__dirname, 'test'), test.file)
                  .replace(/\//g, '-')
              ),
              { recursive: true, force: true }
            )
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

  const runTest = async (/** @type {TestFile} */ test) => {
    // On CI retry attempts, skip tests that already passed on this commit
    if (cachedPassedTests.has(test.file)) {
      console.log(
        `${test.file} already passed on this commit (cached) — skipping`
      )
      return
    }

    let passed = false

    for (let i = 0; i < numRetries + 1; i++) {
      try {
        console.log(`Starting ${test.file} retry ${i}/${numRetries}`)
        const time = await runTestOnce(test, i === numRetries, i > 0)
        timings.push({
          file: test.file,
          time,
        })
        passed = true
        console.log(
          `${test.file} finished on retry ${i}/${numRetries} in ${time / 1000}s`
        )
        break
      } catch (err) {
        if (i < numRetries) {
          try {
            let testDir = path.dirname(path.join(__dirname, test.file))

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
          console.error(`${test.file} failed due to ${err}`)
        }
      }
    }

    if (passed) {
      recordPassed(test.file)
    }

    if (!passed) {
      hadFailures = true
      // "failed to pass within" is a keyword parsed by next-pr-webhook
      console.error(`${test.file} failed to pass within ${numRetries} retries`)
    }

    // Emit test output, parsed by the commenter webhook to notify about failing tests.
    // Also emit for all tests when NEXT_TEST_EMIT_ALL_OUTPUT is set (for manifest generation).
    if ((!passed || process.env.NEXT_TEST_EMIT_ALL_OUTPUT) && isTestJob) {
      try {
        const testsOutput = await fsp.readFile(
          `${test.file}${RESULTS_EXT}`,
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
          const existing = errorsPerTests.get(test.file)
          if (existing) {
            existing.failedCases = failedCases
          }
        }

        obj.processEnv = {
          NEXT_TEST_MODE: process.env.NEXT_TEST_MODE,
          HEADLESS: process.env.HEADLESS,
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
    tests.map(async (test) => {
      // TODO: Use explicit resource management instead of this acquire/release
      // pattern once CI runs with Node.js 24+.
      await sema.acquire()

      try {
        await runTest(test)
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
