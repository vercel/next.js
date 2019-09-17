const path = require('path')
const _glob = require('glob')
const { promisify } = require('util')
const { Sema } = require('async-sema')
const { spawn, exec: execOrig } = require('child_process')

const glob = promisify(_glob)
const exec = promisify(execOrig)

const NUM_RETRIES = 2
const DEFAULT_CONCURRENCY = 3

;(async () => {
  let concurrencyIdx = process.argv.indexOf('-c')
  const concurrency =
    parseInt(process.argv[concurrencyIdx + 1], 10) || DEFAULT_CONCURRENCY

  const groupIdx = process.argv.indexOf('-g')
  const groupArg = groupIdx !== -1 && process.argv[groupIdx + 1]

  console.log('Running tests with concurrency:', concurrency)
  let tests = process.argv.filter(arg => arg.endsWith('.test.js'))

  if (tests.length === 0) {
    tests = await glob('**/*.test.js', {
      nodir: true,
      cwd: path.join(__dirname, 'test')
    })
  }

  let testNames = [
    ...new Set(
      tests.map(f => {
        let name = `${path
          .dirname(f)
          .replace(/\\/g, '/')
          .replace(/\/test$/, '')}/`
        if (!name.startsWith('test/')) name = `test/${name}`
        return name
      })
    )
  ]

  if (groupArg) {
    const groupParts = groupArg.split('/')
    const groupPos = parseInt(groupParts[0], 10)
    const groupTotal = parseInt(groupParts[1], 10)
    const numPerGroup = Math.ceil(testNames.length / groupTotal)
    let offset = groupPos === 1 ? 0 : (groupPos - 1) * numPerGroup - 1
    // if there's an odd number of suites give the first group the extra
    if (testNames.length % 2 !== 0 && groupPos !== 1) offset++
    testNames = testNames.splice(offset, numPerGroup)
  }

  const sema = new Sema(concurrency, { capacity: testNames.length })
  const jestPath = path.join(
    path.dirname(require.resolve('jest-cli/package')),
    'bin/jest.js'
  )
  const children = new Set()

  const runTest = (test = '') =>
    new Promise((resolve, reject) => {
      const child = spawn(
        'node',
        [jestPath, '--runInBand', '--forceExit', '--verbose', test],
        {
          stdio: 'inherit'
        }
      )
      children.add(child)
      child.on('exit', code => {
        children.delete(child)
        if (code) reject(new Error(`failed with code: ${code}`))
        resolve()
      })
    })

  await Promise.all(
    testNames.map(async test => {
      await sema.acquire()
      let passed = false

      for (let i = 0; i < NUM_RETRIES + 1; i++) {
        try {
          await runTest(test)
          passed = true
          break
        } catch (err) {
          if (i < NUM_RETRIES) {
            try {
              console.log('Cleaning test files for', test)
              await exec(`git clean -fdx "${path.join(__dirname, test)}"`)
              await exec(`git checkout "${path.join(__dirname, test)}"`)
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
})()
