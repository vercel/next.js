const path = require('path')
const _glob = require('glob')
const psList = require('ps-list')
const _treeKill = require('tree-kill')
const { promisify } = require('util')
const { Sema } = require('async-sema')
const { spawn, exec: execOrig } = require('child_process')

const glob = promisify(_glob)
const exec = promisify(execOrig)
const treeKill = promisify(_treeKill)

const NUM_RETRIES = 2
const DEFAULT_CONCURRENCY = 3

;(async () => {
  // kills all node process except current one and all Chrome(driver) instances
  const useHardRetries = process.argv.indexOf('--hard-retry') > -1
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
      const exitHandler = code => {
        children.delete(child)
        if (code) reject(new Error(`failed with code: ${code}`))
        resolve()
      }
      child.on('exit', exitHandler)

      child.prepareRestart = () => {
        child.removeListener('exit', exitHandler)
        children.delete(child)
        child.kill()
      }
      child.restart = () => resolve(runTest(test))
      children.add(child)
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

            if (useHardRetries) {
              const runningChildren = [...children]
              runningChildren.forEach(child => child.prepareRestart())
              for (const proc of await psList()) {
                const name = proc.name.toLowerCase()

                if (name.includes('chrome') || name.includes('node')) {
                  if (proc.pid !== process.pid) {
                    console.log('killing', name)
                    try {
                      await treeKill(proc.pid)
                    } catch (_) {}
                  }
                }
              }
              runningChildren.forEach(child => child.restart())
            }
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
