const os = require('os')
const path = require('path')
const _glob = require('glob')
const fs = require('fs-extra')
const nodeFetch = require('node-fetch')
const vercelFetch = require('@vercel/fetch')
const fetch = vercelFetch(nodeFetch)
const { promisify } = require('util')
const { Sema } = require('async-sema')
const { spawn, exec: execOrig } = require('child_process')
const { createNextInstall } = require('./test/lib/create-next-install')
const glob = promisify(_glob)
const exec = promisify(execOrig)

const timings = []
const DEFAULT_NUM_RETRIES = os.platform() === 'win32' ? 2 : 1
const DEFAULT_CONCURRENCY = 2
const RESULTS_EXT = `.results.json`
const isTestJob = !!process.env.NEXT_TEST_JOB
const TIMINGS_API = `https://api.github.com/gists/4500dd89ae2f5d70d9aaceb191f528d1`
const TIMINGS_API_HEADERS = {
  Accept: 'application/vnd.github.v3+json',
}

const testFilters = {
  unit: 'unit/',
  e2e: 'e2e/',
  production: 'production/',
  development: 'development/',
}

// which types we have configured to run separate
const configuredTestTypes = Object.values(testFilters)

const cleanUpAndExit = async (code) => {
  if (process.env.NEXT_TEST_STARTER) {
    await fs.remove(process.env.NEXT_TEST_STARTER)
  }
  console.log(`exiting with code ${code}`)
  process.exit(code)
}

async function getTestTimings() {
  const timingsRes = await fetch(TIMINGS_API, {
    headers: {
      ...TIMINGS_API_HEADERS,
    },
  })

  if (!timingsRes.ok) {
    throw new Error(`request status: ${timingsRes.status}`)
  }
  const timingsData = await timingsRes.json()
  return JSON.parse(timingsData.files['test-timings.json'].content)
}

async function main() {
  let numRetries = DEFAULT_NUM_RETRIES
  let concurrencyIdx = process.argv.indexOf('-c')
  let concurrency =
    (concurrencyIdx > -1 && parseInt(process.argv[concurrencyIdx + 1], 10)) ||
    DEFAULT_CONCURRENCY

  const hideOutput = !process.argv.includes('--debug')
  const outputTimings = process.argv.includes('--timings')
  const writeTimings = process.argv.includes('--write-timings')
  const groupIdx = process.argv.indexOf('-g')
  const groupArg = groupIdx !== -1 && process.argv[groupIdx + 1]

  const testTypeIdx = process.argv.indexOf('--type')
  const testType = testTypeIdx > -1 ? process.argv[testTypeIdx + 1] : undefined
  let filterTestsBy

  switch (testType) {
    case 'unit': {
      numRetries = 0
      filterTestsBy = testFilters.unit
      break
    }
    case 'development': {
      filterTestsBy = testFilters.development
      break
    }
    case 'production': {
      filterTestsBy = testFilters.production
      break
    }
    case 'e2e': {
      filterTestsBy = testFilters.e2e
      break
    }
    case 'all':
      filterTestsBy = 'none'
      break
    default:
      break
  }

  console.log('Running tests with concurrency:', concurrency)

  let tests = process.argv.filter((arg) => arg.match(/\.test\.(js|ts|tsx)/))
  let prevTimings

  if (tests.length === 0) {
    tests = (
      await glob('**/*.test.{js,ts,tsx}', {
        nodir: true,
        cwd: path.join(__dirname, 'test'),
      })
    ).filter((test) => {
      if (filterTestsBy) {
        // only include the specified type
        return filterTestsBy === 'none' ? true : test.startsWith(filterTestsBy)
      } else {
        // include all except the separately configured types
        return !configuredTestTypes.some((type) => test.startsWith(type))
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
          prevTimings = await getTestTimings()
          console.log('Fetched previous timings data successfully')

          if (writeTimings) {
            await fs.writeFile(timingsFile, JSON.stringify(prevTimings))
            console.log('Wrote previous timings data to', timingsFile)
            await cleanUpAndExit(0)
          }
        }
      } catch (err) {
        console.log(`Failed to fetch timings data`, err)
        await cleanUpAndExit(1)
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
      const numPerGroup = Math.ceil(testNames.length / groupTotal)
      let offset = (groupPos - 1) * numPerGroup
      testNames = testNames.slice(offset, offset + numPerGroup)
    }
  }

  if (testNames.length === 0) {
    console.log('No tests found for', testType, 'exiting..')
    return cleanUpAndExit(0)
  }

  console.log('Running tests:', '\n', ...testNames.map((name) => `${name}\n`))

  const hasIsolatedTests = testNames.some((test) => {
    return configuredTestTypes.some(
      (type) => type !== testFilters.unit && test.startsWith(`test/${type}`)
    )
  })

  if (
    process.env.NEXT_TEST_MODE !== 'deploy' &&
    ((testType && testType !== 'unit') || hasIsolatedTests)
  ) {
    // for isolated next tests: e2e, dev, prod we create
    // a starter Next.js install to re-use to speed up tests
    // to avoid having to run yarn each time
    console.log('Creating Next.js install for isolated tests')
    const reactVersion = process.env.NEXT_TEST_REACT_VERSION || 'latest'
    const testStarter = await createNextInstall({
      react: reactVersion,
      'react-dom': reactVersion,
    })
    process.env.NEXT_TEST_STARTER = testStarter
  }

  const sema = new Sema(concurrency, { capacity: testNames.length })
  const children = new Set()
  const jestPath = path.join(
    __dirname,
    'node_modules',
    '.bin',
    `jest${process.platform === 'win32' ? '.CMD' : ''}`
  )

  const runTest = (test = '', isFinalRun) =>
    new Promise((resolve, reject) => {
      const start = new Date().getTime()
      let outputChunks = []
      const child = spawn(
        jestPath,
        [
          '--runInBand',
          '--forceExit',
          '--verbose',
          ...(isTestJob
            ? ['--json', `--outputFile=${test}${RESULTS_EXT}`]
            : []),
          test,
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            // run tests in headless mode by default
            HEADLESS: 'true',
            TRACE_PLAYWRIGHT: 'true',
            ...(isFinalRun
              ? {
                  // Events can be finicky in CI. This switches to a more
                  // reliable polling method.
                  // CHOKIDAR_USEPOLLING: 'true',
                  // CHOKIDAR_INTERVAL: 500,
                  // WATCHPACK_POLLING: 500,
                }
              : {}),
          },
        }
      )
      const handleOutput = (chunk) => {
        if (hideOutput) {
          outputChunks.push(chunk)
        } else {
          process.stderr.write(chunk)
        }
      }
      child.stdout.on('data', handleOutput)
      child.stderr.on('data', handleOutput)

      children.add(child)

      child.on('exit', async (code, signal) => {
        children.delete(child)
        if (code !== 0 || signal !== null) {
          if (isFinalRun && hideOutput) {
            // limit out to last 64kb so that we don't
            // run out of log room in CI
            const trimmedOutput = []

            for (let i = outputChunks.length; i >= 0; i--) {
              const chunk = outputChunks[i]
              if (!chunk) continue

              trimmedOutput.unshift(chunk)
            }
            trimmedOutput.forEach((chunk) => process.stdout.write(chunk))
          }
          return reject(
            new Error(
              code
                ? `failed with code: ${code}`
                : `failed with signal: ${signal}`
            )
          )
        }
        await fs
          .remove(
            path.join(
              __dirname,
              'test/traces',
              path
                .relative(path.join(__dirname, 'test'), test)
                .replace(/\//g, '-')
            )
          )
          .catch(() => {})
        resolve(new Date().getTime() - start)
      })
    })

  const directorySemas = new Map()

  await Promise.all(
    testNames.map(async (test) => {
      const dirName = path.dirname(test)
      let dirSema = directorySemas.get(dirName)
      if (dirSema === undefined)
        directorySemas.set(dirName, (dirSema = new Sema(1)))
      await dirSema.acquire()
      await sema.acquire()
      let passed = false

      for (let i = 0; i < numRetries + 1; i++) {
        try {
          console.log(`Starting ${test} retry ${i}/${numRetries}`)
          const time = await runTest(test, i === numRetries)
          timings.push({
            file: test,
            time,
          })
          passed = true
          console.log(
            `Finished ${test} on retry ${i}/${numRetries} in ${time / 1000}s`
          )
          break
        } catch (err) {
          if (i < numRetries) {
            try {
              const testDir = path.dirname(path.join(__dirname, test))
              console.log('Cleaning test files at', testDir)
              await exec(`git clean -fdx "${testDir}"`)
              await exec(`git checkout "${testDir}"`)
            } catch (err) {}
          } else {
            console.error(`${test} failed due to ${err}`)
          }
        }
      }
      if (!passed) {
        console.error(`${test} failed to pass within ${numRetries} retries`)
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
        cleanUpAndExit(1)
      }
      sema.release()
      dirSema.release()
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

    if (prevTimings && process.env.TEST_TIMINGS_TOKEN) {
      try {
        const newTimings = {
          ...(await getTestTimings()),
          ...curTimings,
        }

        for (const test of Object.keys(newTimings)) {
          if (!(await fs.pathExists(path.join(__dirname, test)))) {
            console.log('removing stale timing', test)
            delete newTimings[test]
          }
        }

        const timingsRes = await fetch(TIMINGS_API, {
          method: 'PATCH',
          headers: {
            ...TIMINGS_API_HEADERS,
            Authorization: `Bearer ${process.env.TEST_TIMINGS_TOKEN}`,
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
        console.log(
          'Sent updated timings successfully',
          await timingsRes.json()
        )
      } catch (err) {
        console.log('Failed to update timings data', err)
      }
    }
  }
  await cleanUpAndExit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
