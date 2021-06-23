const path = require('path')
const _glob = require('glob')
const fs = require('fs').promises
const fetch = require('node-fetch')
const { promisify } = require('util')
const { Sema } = require('async-sema')
const { spawn, exec: execOrig } = require('child_process')

const glob = promisify(_glob)
const exec = promisify(execOrig)

const timings = []
const NUM_RETRIES = 2
const DEFAULT_CONCURRENCY = 2
const RESULTS_EXT = `.results.json`
const isTestJob = !!process.env.NEXT_TEST_JOB
const TIMINGS_API = `https://next-timings.jjsweb.site/api/timings`

const UNIT_TEST_EXT = '.unit.test.js'
const DEV_TEST_EXT = '.dev.test.js'
const PROD_TEST_EXT = '.prod.test.js'

const NON_CONCURRENT_TESTS = [
  'test/integration/basic/test/index.test.js',
  'test/acceptance/ReactRefresh.dev.test.js',
  'test/acceptance/ReactRefreshLogBox.dev.test.js',
  'test/acceptance/ReactRefreshRegression.dev.test.js',
  'test/acceptance/ReactRefreshRequire.dev.test.js',
]

// which types we have configured to run separate
const configuredTestTypes = [UNIT_TEST_EXT]

async function main() {
  let concurrencyIdx = process.argv.indexOf('-c')
  const concurrency =
    parseInt(process.argv[concurrencyIdx + 1], 10) || DEFAULT_CONCURRENCY

  const outputTimings = process.argv.indexOf('--timings') !== -1
  const writeTimings = process.argv.indexOf('--write-timings') !== -1
  const isAzure = process.argv.indexOf('--azure') !== -1
  const groupIdx = process.argv.indexOf('-g')
  const groupArg = groupIdx !== -1 && process.argv[groupIdx + 1]

  const testTypeIdx = process.argv.indexOf('--type')
  const testType = process.argv[testTypeIdx + 1]

  let filterTestsBy

  switch (testType) {
    case 'unit':
      filterTestsBy = UNIT_TEST_EXT
      break
    case 'dev':
      filterTestsBy = DEV_TEST_EXT
      break
    case 'production':
      filterTestsBy = PROD_TEST_EXT
      break
    case 'all':
      filterTestsBy = 'none'
      break
    default:
      break
  }

  console.log('Running tests with concurrency:', concurrency)
  let tests = process.argv.filter((arg) => arg.endsWith('.test.js'))
  let prevTimings

  if (tests.length === 0) {
    tests = (
      await glob('**/*.test.js', {
        nodir: true,
        cwd: path.join(__dirname, 'test'),
      })
    ).filter((test) => {
      // only include the specified type
      if (filterTestsBy) {
        return filterTestsBy === 'none' ? true : test.endsWith(filterTestsBy)
        // include all except the separately configured types
      } else {
        return !configuredTestTypes.some((type) => test.endsWith(type))
      }
    })

    if (outputTimings && groupArg) {
      console.log('Fetching previous timings data')
      try {
        const timingsFile = path.join(__dirname, 'test-timings.json')
        try {
          prevTimings = JSON.parse(await fs.readFile(timingsFile, 'utf8'))
          console.log('Loaded test timings from disk successfully')
        } catch (_) {}

        if (!prevTimings) {
          const timingsRes = await fetch(
            `${TIMINGS_API}?which=${isAzure ? 'azure' : 'actions'}`
          )

          if (!timingsRes.ok) {
            throw new Error(`request status: ${timingsRes.status}`)
          }
          prevTimings = await timingsRes.json()
          console.log('Fetched previous timings data successfully')

          if (writeTimings) {
            await fs.writeFile(timingsFile, JSON.stringify(prevTimings))
            console.log('Wrote previous timings data to', timingsFile)
            process.exit(0)
          }
        }
      } catch (err) {
        console.log(`Failed to fetch timings data`, err)
      }
    }
  }

  let testNames = [
    ...new Set(
      tests.map((f) => {
        let name = `${f.replace(/\\/g, '/').replace(/\/test$/, '')}`
        if (!name.startsWith('test/')) name = `test/${name}`
        return name
      })
    ),
  ]

  if (groupArg) {
    const groupParts = groupArg.split('/')
    const groupPos = parseInt(groupParts[0], 10)
    const groupTotal = parseInt(groupParts[1], 10)
    const numPerGroup = Math.ceil(testNames.length / groupTotal)
    let offset = groupPos === 1 ? 0 : (groupPos - 1) * numPerGroup - 1
    // if there's an odd number of suites give the first group the extra
    if (testNames.length % 2 !== 0 && groupPos !== 1) offset++

    if (prevTimings) {
      const groups = [[]]
      const groupTimes = [0]

      for (const testName of testNames) {
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
        groups[smallestGroupIdx].push(testName)
        groupTimes[smallestGroupIdx] += prevTimings[testName] || 1
      }

      const curGroupIdx = groupPos - 1
      testNames = groups[curGroupIdx]

      console.log(
        'Current group previous accumulated times:',
        Math.round(groupTimes[curGroupIdx]) + 's'
      )
    } else {
      testNames = testNames.splice(offset, numPerGroup)
    }
  }
  console.log('Running tests:', '\n', ...testNames.map((name) => `${name}\n`))

  const sema = new Sema(concurrency, { capacity: testNames.length })
  const jestPath = path.join(
    path.dirname(require.resolve('jest-cli/package.json')),
    'bin/jest.js'
  )
  const children = new Set()

  const runTest = (test = '', usePolling) =>
    new Promise((resolve, reject) => {
      const start = new Date().getTime()
      const child = spawn(
        'node',
        [
          jestPath,
          '--runInBand',
          '--forceExit',
          '--verbose',
          ...(isTestJob
            ? ['--json', `--outputFile=${test}${RESULTS_EXT}`]
            : []),
          test,
        ],
        {
          stdio: 'inherit',
          env: {
            JEST_RETRY_TIMES: 0,
            ...process.env,
            ...(isAzure
              ? {
                  HEADLESS: 'true',
                  __POST_PROCESS_MIDDLEWARE_TIME_BUDGET: '50',
                }
              : {}),
            ...(usePolling
              ? {
                  // Events can be finicky in CI. This switches to a more
                  // reliable polling method.
                  CHOKIDAR_USEPOLLING: 'true',
                  CHOKIDAR_INTERVAL: 500,
                }
              : {}),
          },
        }
      )
      children.add(child)
      child.on('exit', (code) => {
        children.delete(child)
        if (code) reject(new Error(`failed with code: ${code}`))
        resolve(new Date().getTime() - start)
      })
    })

  const nonConcurrentTestNames = []

  testNames = testNames.filter((testName) => {
    if (NON_CONCURRENT_TESTS.includes(testName)) {
      nonConcurrentTestNames.push(testName)
      return false
    }
    return true
  })

  // run non-concurrent test names separately and before
  // concurrent ones
  for (const test of nonConcurrentTestNames) {
    let passed = false

    for (let i = 0; i < NUM_RETRIES + 1; i++) {
      try {
        const time = await runTest(test, i > 0)
        timings.push({
          file: test,
          time,
        })
        passed = true
        break
      } catch (err) {
        if (i < NUM_RETRIES) {
          try {
            const testDir = path.dirname(path.join(__dirname, test))
            console.log('Cleaning test files at', testDir)
            await exec(`git clean -fdx "${testDir}"`)
            await exec(`git checkout "${testDir}"`)
          } catch (err) {}
        }
      }
    }
    if (!passed) {
      console.error(`${test} failed to pass within ${NUM_RETRIES} retries`)
      children.forEach((child) => child.kill())

      if (isTestJob) {
        try {
          const testsOutput = await fs.readFile(`${test}${RESULTS_EXT}`, 'utf8')
          console.log(
            `--test output start--`,
            testsOutput,
            `--test output end--`
          )
        } catch (err) {
          console.log(`Failed to load test output`, err)
        }
      }
      process.exit(1)
    }
  }

  await Promise.all(
    testNames.map(async (test) => {
      await sema.acquire()
      let passed = false

      for (let i = 0; i < NUM_RETRIES + 1; i++) {
        try {
          const time = await runTest(test, i > 0)
          timings.push({
            file: test,
            time,
          })
          passed = true
          break
        } catch (err) {
          if (i < NUM_RETRIES) {
            try {
              const testDir = path.dirname(path.join(__dirname, test))
              console.log('Cleaning test files at', testDir)
              await exec(`git clean -fdx "${testDir}"`)
              await exec(`git checkout "${testDir}"`)
            } catch (err) {}
          }
        }
      }
      if (!passed) {
        console.error(`${test} failed to pass within ${NUM_RETRIES} retries`)
        children.forEach((child) => child.kill())

        if (isTestJob) {
          try {
            const testsOutput = await fs.readFile(
              `${test}${RESULTS_EXT}`,
              'utf8'
            )
            console.log(
              `--test output start--`,
              testsOutput,
              `--test output end--`
            )
          } catch (err) {
            console.log(`Failed to load test output`, err)
          }
        }
        process.exit(1)
      }
      sema.release()
    })
  )

  if (outputTimings) {
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

    if (prevTimings) {
      try {
        const timingsRes = await fetch(TIMINGS_API, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            timings: curTimings,
            which: isAzure ? 'azure' : 'actions',
          }),
        })

        if (!timingsRes.ok) {
          throw new Error(`request status: ${timingsRes.status}`)
        }
        console.log(
          'Sent updated timings successfully',
          await timingsRes.json()
        )
      } catch (err) {
        console.log('Failed to update timings data', err)
      }
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
