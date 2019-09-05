const path = require('path')
const _glob = require('glob')
const fs = require('fs-extra')
const { promisify } = require('util')
const { Sema } = require('async-sema')
const { spawn, exec: execOrig } = require('child_process')

const glob = promisify(_glob)
const exec = promisify(execOrig)

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
      const getTestFiles = () =>
        glob('**/*', {
          nodir: true,
          cwd: path.join(__dirname, test),
          dot: true
        })
      const testFiles = new Set(await getTestFiles())

      for (let i = 0; i < NUM_RETRIES; i++) {
        try {
          await runTest(test)
          passed = true
          break
        } catch (err) {
          if (i < NUM_RETRIES - 1) {
            try {
              console.log('Cleaning test files for', test)
              const curFiles = await getTestFiles()

              for (const file of curFiles) {
                if (!testFiles.has(file)) {
                  await fs.remove(path.join(__dirname, test, file))
                }
              }
              for (const file of testFiles) {
                try {
                  await exec(
                    `git checkout "${path.join(__dirname, test, file)}"`
                  )
                } catch (err) {}
              }
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
