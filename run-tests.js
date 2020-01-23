const path = require('path')
const _glob = require('glob')
const fs = require('fs-extra')
const fetch = require('node-fetch')
const { promisify } = require('util')
const { Sema } = require('async-sema')
const { spawn, exec: execOrig } = require('child_process')

const glob = promisify(_glob)
const exec = promisify(execOrig)

const NUM_RETRIES = 2
const DEFAULT_CONCURRENCY = 2
const timings = []

;(async () => {
  let concurrencyIdx = process.argv.indexOf('-c')
  const concurrency =
    parseInt(process.argv[concurrencyIdx + 1], 10) || DEFAULT_CONCURRENCY

  const outputTimings = process.argv.indexOf('--timings') !== -1
  const groupIdx = process.argv.indexOf('-g')
  const groupArg = groupIdx !== -1 && process.argv[groupIdx + 1]

  console.log('Running tests with concurrency:', concurrency)
  let tests = process.argv.filter(arg => arg.endsWith('.test.js'))
  let prevTimings

  if (tests.length === 0) {
    tests = await glob('**/*.test.js', {
      nodir: true,
      cwd: path.join(__dirname, 'test'),
    })

    if (outputTimings) {
      console.log('Fetching previous timings data')
      const metaRes = await fetch(
        `https://circleci.com/api/v1.1/project/github/zeit/next.js/`
      )

      if (metaRes.ok) {
        const buildsMeta = await metaRes.json()
        let buildNumber

        for (const build of buildsMeta) {
          if (
            build.status === 'success' &&
            build.build_parameters &&
            build.build_parameters.CIRCLE_JOB === 'test'
          ) {
            buildNumber = build.build_num
            break
          }
        }

        const timesRes = await fetch(
          `https://circleci.com/api/v1.1/project/github/zeit/next.js/${buildNumber}/tests`
        )

        if (timesRes.ok) {
          const { tests } = await timesRes.json()
          prevTimings = {}

          for (const test of tests) {
            prevTimings[test.file] = test.run_time
          }

          if (Object.keys(prevTimings).length > 0) {
            console.log('Fetched previous timings data')
          } else {
            prevTimings = null
          }
        } else {
          console.log(
            'Failed to fetch previous timings status:',
            timesRes.status
          )
        }
      } else {
        console.log('Failed to fetch timings meta status:', metaRes.status)
      }
    }
  }

  let testNames = [
    ...new Set(
      tests.map(f => {
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

        // get the samllest group time to add current one to
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
  console.log('Running tests:', '\n', ...testNames.map(name => `${name}\n`))

  const sema = new Sema(concurrency, { capacity: testNames.length })
  const jestPath = path.join(
    path.dirname(require.resolve('jest-cli/package')),
    'bin/jest.js'
  )
  const children = new Set()

  const runTest = (test = '', usePolling) =>
    new Promise((resolve, reject) => {
      const start = new Date().getTime()
      const child = spawn(
        'node',
        [jestPath, '--runInBand', '--forceExit', '--verbose', test],
        {
          stdio: 'inherit',
          env: {
            ...process.env,
            ...(usePolling
              ? {
                  // Events can be finicky in CI. This switches to a more reliable
                  // polling method.
                  CHOKIDAR_USEPOLLING: 'true',
                  CHOKIDAR_INTERVAL: 500,
                }
              : {}),
          },
        }
      )
      children.add(child)
      child.on('exit', code => {
        children.delete(child)
        if (code) reject(new Error(`failed with code: ${code}`))
        resolve(new Date().getTime() - start)
      })
    })

  await Promise.all(
    testNames.map(async test => {
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
        children.forEach(child => child.kill())
        process.exit(1)
      }
      sema.release()
    })
  )

  if (outputTimings) {
    let junitData = `<testsuites name="jest tests">`
    /*
      <testsuite name="/__tests__/bar.test.js" tests="1" errors="0" failures="0" skipped="0" timestamp="2017-10-10T21:56:49" time="0.323">
        <testcase classname="bar-should be bar" name="bar-should be bar" time="0.004">
        </testcase>
      </testsuite>
    */

    for (const timing of timings) {
      const timeInSeconds = timing.time / 1000

      junitData += `
        <testsuite name="${timing.file}" file="${
        timing.file
      }" tests="1" errors="0" failures="0" skipped="0" timestamp="${new Date().toJSON()}" time="${timeInSeconds}">
          <testcase classname="tests suite should pass" name="${
            timing.file
          }" time="${timeInSeconds}"></testcase>
        </testsuite>
      `
    }

    junitData += `</testsuites>`
    await fs.writeFile('test/junit.xml', junitData, 'utf8')
    console.log('output timing data to junit.xml')
  }
})()
