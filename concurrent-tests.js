const path = require('path')
const _glob = require('glob')
const { promisify } = require('util')
const { Sema } = require('async-sema')
const { spawn } = require('child_process')
const glob = promisify(_glob)

const NUM_RETRIES = 2
const DEFAULT_CONCURRENCY = 2

;(async () => {
  let concurrencyIdx = process.argv.indexOf('-c')
  const concurrency =
    parseInt(process.argv[concurrencyIdx + 1], 10) || DEFAULT_CONCURRENCY

  console.log('Running tests with concurrency:', concurrency)
  let tests = process.argv.filter(arg => arg.endsWith('.test.js'))

  if (tests.length === 0) {
    tests = await glob('**/*.test.js', {
      nodir: true,
      cwd: path.join(__dirname, 'test')
    })
  }

  const testNames = [
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

  console.log('Found tests:', testNames)
  const sema = new Sema(concurrency, { capacity: testNames.length })

  const runTest = (test = '') =>
    new Promise((resolve, reject) => {
      const child = spawn(
        'yarn',
        ['jest', '--runInBand', '--forceExit', '--verbose', test],
        {
          stdio: 'inherit'
        }
      )
      child.on('exit', code => {
        if (code) reject(new Error(`failed with code: ${code}`))
        resolve()
      })
    })

  await Promise.all(
    testNames.map(async test => {
      await sema.acquire()
      let passed = false
      for (let i = 0; i < NUM_RETRIES; i++) {
        try {
          await runTest(test)
          passed = true
          break
        } catch (err) {}
      }
      if (!passed) {
        throw new Error(`${test} failed to pass within ${NUM_RETRIES} retries`)
      }
      sema.release()
    })
  )
})()
