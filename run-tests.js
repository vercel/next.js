const os = require('os')
const path = require('path')
const _glob = require('glob')
const { existsSync } = require('fs')
const fsp = require('fs/promises')
const nodeFetch = require('node-fetch')
const vercelFetch = require('@vercel/fetch')
const fetch = vercelFetch(nodeFetch)
const { promisify } = require('util')
const { Sema } = require('async-sema')
const { spawn, exec: execOrig } = require('child_process')
const { createNextInstall } = require('./test/lib/create-next-install')
const glob = promisify(_glob)
const exec = promisify(execOrig)
const core = require('@actions/core')
const { getTestFilter } = require('./test/get-test-filter')

let argv = require('yargs/yargs')(process.argv.slice(2))
  .string('type')
  .string('test-pattern')
  .boolean('timings')
  .boolean('write-timings')
  .boolean('debug')
  .string('g')
  .alias('g', 'group')
  .number('c')
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
const DEFAULT_NUM_RETRIES = os.platform() === 'win32' ? 2 : 1
const DEFAULT_CONCURRENCY = 2
const RESULTS_EXT = `.results.json`
const isTestJob = !!process.env.NEXT_TEST_JOB
// Check env to see if test should continue even if some of test fails
const shouldContinueTestsOnError = !!process.env.NEXT_TEST_CONTINUE_ON_ERROR
// Check env to load a list of test paths to skip retry. This is to be used in conjunction with NEXT_TEST_CONTINUE_ON_ERROR,
// When try to run all of the tests regardless of pass / fail and want to skip retrying `known` failed tests.
// manifest should be a json file with an array of test paths.
const skipRetryTestManifest = process.env.NEXT_TEST_SKIP_RETRY_MANIFEST
  ? require(process.env.NEXT_TEST_SKIP_RETRY_MANIFEST)
  : []
const TIMINGS_API = `https://api.github.com/gists/4500dd89ae2f5d70d9aaceb191f528d1`
const TIMINGS_API_HEADERS = {
  Accept: 'application/vnd.github.v3+json',
  ...(process.env.TEST_TIMINGS_TOKEN
    ? {
        Authorization: `Bearer ${process.env.TEST_TIMINGS_TOKEN}`,
      }
    : {}),
}

const testFilters = {
  development: new RegExp(
    '^(test/(development|e2e)|packages/.*/src/.*)/.*\\.test\\.(js|jsx|ts|tsx)$'
  ),
  production: new RegExp(
    '^(test/(production|e2e))/.*\\.test\\.(js|jsx|ts|tsx)$'
  ),
  unit: new RegExp(
    '^test/unit|packages/.*/src/.*/.*\\.test\\.(js|jsx|ts|tsx)$'
  ),
  examples: 'examples/',
  integration: 'test/integration/',
  e2e: 'test/e2e/',
}

const mockTrace = () => ({
  traceAsyncFn: (fn) => fn(mockTrace()),
  traceChild: () => mockTrace(),
})

// which types we have configured to run separate
const configuredTestTypes = Object.values(testFilters)
const errorsPerTests = new Map()

async function maybeLogSummary() {
  if (process.env.CI && errorsPerTests.size > 0) {
    const outputTemplate = `
${Array.from(errorsPerTests.entries())
  .map(([test, output]) => {
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

    await core.summary
      .addHeading('Tests failures')
      .addTable([
        [
          {
            data: 'Test suite',
            header: true,
          },
        ],
        ...Array.from(errorsPerTests.entries()).map(([test]) => {
          return [
            `<a href="https://github.com/vercel/next.js/blob/canary/${test}">${test}</a>`,
          ]
        }),
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
  if (process.env.NEXT_TEST_TEMP_REPO) {
    await fsp.rm(process.env.NEXT_TEST_TEMP_REPO, {
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
  let timingsRes

  const doFetch = () =>
    fetch(TIMINGS_API, {
      headers: {
        ...TIMINGS_API_HEADERS,
      },
    })
  timingsRes = await doFetch()

  if (timingsRes.status === 403) {
    const delay = 15
    console.log(`Got 403 response waiting ${delay} seconds before retry`)
    await new Promise((resolve) => setTimeout(resolve, delay * 1000))
    timingsRes = await doFetch()
  }

  if (!timingsRes.ok) {
    throw new Error(`request status: ${timingsRes.status}`)
  }
  const timingsData = await timingsRes.json()
  return JSON.parse(timingsData.files['test-timings.json'].content)
}

async function main() {
  let numRetries = DEFAULT_NUM_RETRIES

  // Ensure we have the arguments awaited from yargs.
  argv = await argv

  const options = {
    concurrency: argv.concurrency || DEFAULT_CONCURRENCY,
    debug: argv.debug ?? false,
    timings: argv.timings ?? false,
    writeTimings: argv.writeTimings ?? false,
    group: argv.group ?? false,
    testPattern: argv.testPattern ?? false,
    type: argv.type ?? false,
  }

  const hideOutput = !options.debug

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

  console.log('Running tests with concurrency:', options.concurrency)

  /** @type TestFile[] */
  let tests = argv._.filter((arg) => arg.match(/\.test\.(js|ts|tsx)/)).map(
    (file) => ({
      file,
      excludedCases: [],
    })
  )
  let prevTimings

  if (tests.length === 0) {
    let testPatternRegex

    if (options.testPattern) {
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
  }

  if (options.timings && options.group) {
    console.log('Fetching previous timings data')
    try {
      const timingsFile = path.join(process.cwd(), 'test-timings.json')
      try {
        prevTimings = JSON.parse(await fsp.readFile(timingsFile, 'utf8'))
        console.log('Loaded test timings from disk successfully')
      } catch (_) {
        console.error('failed to load from disk', _)
      }

      if (!prevTimings) {
        prevTimings = await getTestTimings()
        console.log('Fetched previous timings data successfully')

        if (options.writeTimings) {
          await fsp.writeFile(timingsFile, JSON.stringify(prevTimings))
          console.log('Wrote previous timings data to', timingsFile)
          await cleanUpAndExit(0)
        }
      }
    } catch (err) {
      console.log(`Failed to fetch timings data`, err)
      await cleanUpAndExit(1)
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

  if (options.group) {
    const groupParts = options.group.split('/')
    const groupPos = parseInt(groupParts[0], 10)
    const groupTotal = parseInt(groupParts[1], 10)

    if (prevTimings) {
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
      const numPerGroup = Math.ceil(tests.length / groupTotal)
      let offset = (groupPos - 1) * numPerGroup
      tests = tests.slice(offset, offset + numPerGroup)
      console.log('Splitting without timings')
    }
  }

  if (tests.length === 0) {
    console.log('No tests found for', options.type, 'exiting..')
    return cleanUpAndExit(1)
  }

  console.log(`${GROUP}Running tests:
${tests.map((t) => t.file).join('\n')}
${ENDGROUP}`)
  console.log(`total: ${tests.length}`)

  const hasIsolatedTests = tests.some((test) => {
    return configuredTestTypes.some(
      (type) =>
        type !== testFilters.unit && test.file.startsWith(`test/${type}`)
    )
  })

  if (
    process.platform !== 'win32' &&
    process.env.NEXT_TEST_MODE !== 'deploy' &&
    ((options.type && options.type !== 'unit') || hasIsolatedTests)
  ) {
    // for isolated next tests: e2e, dev, prod we create
    // a starter Next.js install to re-use to speed up tests
    // to avoid having to run yarn each time
    console.log(`${GROUP}Creating Next.js install for isolated tests`)
    const reactVersion = process.env.NEXT_TEST_REACT_VERSION || 'latest'
    const { installDir, pkgPaths, tmpRepoDir } = await createNextInstall({
      parentSpan: mockTrace(),
      dependencies: {
        react: reactVersion,
        'react-dom': reactVersion,
      },
      keepRepoDir: true,
    })

    const serializedPkgPaths = []

    for (const key of pkgPaths.keys()) {
      serializedPkgPaths.push([key, pkgPaths.get(key)])
    }
    process.env.NEXT_TEST_PKG_PATHS = JSON.stringify(serializedPkgPaths)
    process.env.NEXT_TEST_TEMP_REPO = tmpRepoDir
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
  let killed = false

  const runTest = (/** @type {TestFile} */ test, isFinalRun, isRetry) =>
    new Promise((resolve, reject) => {
      const start = new Date().getTime()
      let outputChunks = []

      const shouldRecordTestWithReplay = process.env.RECORD_REPLAY && isRetry

      const args = [
        ...(shouldRecordTestWithReplay
          ? [`--config=jest.replay.config.js`]
          : []),
        ...(process.env.CI ? ['--ci'] : []),
        '--runInBand',
        '--forceExit',
        '--verbose',
        '--silent',
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
      const env = {
        IS_RETRY: isRetry ? 'true' : undefined,
        RECORD_REPLAY: shouldRecordTestWithReplay,
        // run tests in headless mode by default
        HEADLESS: 'true',
        TRACE_PLAYWRIGHT: 'true',
        NEXT_TELEMETRY_DISABLED: '1',
        // unset CI env so CI behavior is only explicitly
        // tested when enabled
        CI: '',
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

      const child = spawn(jestPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          ...env,
        },
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
            const isExpanded =
              firstError && !killed && !shouldContinueTestsOnError
            if (isExpanded) {
              firstError = false
              process.stdout.write(`❌ ${test.file} output:\n`)
            } else if (killed) {
              process.stdout.write(`${GROUP}${test.file} output (killed)\n`)
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

            if (process.env.CI && !killed) {
              errorsPerTests.set(test.file, output)
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
          err.output = outputChunks
            .map(({ chunk }) => chunk.toString())
            .join('')

          return reject(err)
        }

        // If environment is CI and if this test execution is failed after retry, preserve test traces
        // to upload into github actions artifacts for debugging purpose
        const shouldPreserveTracesOutput =
          (process.env.CI && isRetry && isChildExitWithNonZero) ||
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

  const directorySemas = new Map()

  const originalRetries = numRetries
  await Promise.all(
    tests.map(async (test) => {
      const dirName = path.dirname(test.file)
      let dirSema = directorySemas.get(dirName)

      // we only restrict 1 test per directory for
      // legacy integration tests
      if (test.file.startsWith('test/integration') && dirSema === undefined) {
        directorySemas.set(dirName, (dirSema = new Sema(1)))
      }
      if (dirSema) await dirSema.acquire()

      await sema.acquire()
      let passed = false

      const shouldSkipRetries = skipRetryTestManifest.find((t) =>
        t.includes(test.file)
      )
      const numRetries = shouldSkipRetries ? 0 : originalRetries
      if (shouldSkipRetries) {
        console.log(
          `Skipping retry for ${test.file} due to skipRetryTestManifest`
        )
      }

      for (let i = 0; i < numRetries + 1; i++) {
        try {
          console.log(`Starting ${test.file} retry ${i}/${numRetries}`)
          const time = await runTest(
            test,
            shouldSkipRetries || i === numRetries,
            shouldSkipRetries || i > 0
          )
          timings.push({
            file: test.file,
            time,
          })
          passed = true
          console.log(
            `Finished ${test.file} on retry ${i}/${numRetries} in ${
              time / 1000
            }s`
          )
          break
        } catch (err) {
          if (i < numRetries) {
            try {
              let testDir = path.dirname(path.join(__dirname, test.file))

              // if test is nested in a test folder traverse up a dir to ensure
              // we clean up relevant test files
              if (testDir.endsWith('/test') || testDir.endsWith('\\test')) {
                testDir = path.join(testDir, '../')
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

      if (!passed) {
        console.error(
          `${test.file} failed to pass within ${numRetries} retries`
        )

        if (!shouldContinueTestsOnError) {
          killed = true
          children.forEach((child) => child.kill())
          cleanUpAndExit(1)
        } else {
          console.log(
            `CONTINUE_ON_ERROR enabled, continuing tests after ${test.file} failed`
          )
        }
      }

      // Emit test output if test failed or if we're continuing tests on error
      if ((!passed || shouldContinueTestsOnError) && isTestJob) {
        try {
          const testsOutput = await fsp.readFile(
            `${test.file}${RESULTS_EXT}`,
            'utf8'
          )
          const obj = JSON.parse(testsOutput)
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

      sema.release()
      if (dirSema) dirSema.release()
    })
  )

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

    if (prevTimings && process.env.TEST_TIMINGS_TOKEN) {
      try {
        const newTimings = {
          ...(await getTestTimings()),
          ...curTimings,
        }

        for (const test of Object.keys(newTimings)) {
          if (!existsSync(path.join(__dirname, test))) {
            console.log('removing stale timing', test)
            delete newTimings[test]
          }
        }

        const timingsRes = await fetch(TIMINGS_API, {
          method: 'PATCH',
          headers: {
            ...TIMINGS_API_HEADERS,
          },
          body: JSON.stringify({
            files: {
              'test-timings.json': {
                content: JSON.stringify(newTimings),
              },
            },
          }),
        })

        if (!timingsRes.ok) {
          throw new Error(`request status: ${timingsRes.status}`)
        }
        const result = await timingsRes.json()
        console.log(
          `Sent updated timings successfully. API URL: "${result?.url}" HTML URL: "${result?.html_url}"`
        )
      } catch (err) {
        console.log('Failed to update timings data', err)
      }
    }
  }
}

main()
  .then(() => cleanUpAndExit(0))
  .catch((err) => {
    console.error(err)
    cleanUpAndExit(1)
  })
