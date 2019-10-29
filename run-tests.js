const path = require('path')
const _glob = require('glob')
const { promisify } = require('util')
const spawn = require('cross-spawn')

const glob = promisify(_glob)
const DEFAULT_CONCURRENCY = 2
const { BROWSER } = process.env

;(async () => {
  let concurrencyIdx = process.argv.indexOf('-c')
  const concurrency =
    parseInt(process.argv[concurrencyIdx + 1], 10) || DEFAULT_CONCURRENCY

  const groupIdx = process.argv.indexOf('-g')
  const groupArg = groupIdx !== -1 && process.argv[groupIdx + 1]

  let tests = process.argv.filter(arg => arg.endsWith('.test.js'))

  if (tests.length === 0) {
    tests = (await glob('**/*.test.js', {
      nodir: true,
      cwd: path.join(__dirname, 'test')
    })).map(f => path.join('test', f).replace(/\\/g, '/'))
  }

  if (groupArg) {
    const groupParts = groupArg.split('/')
    const groupPos = parseInt(groupParts[0], 10)
    const groupTotal = parseInt(groupParts[1], 10)
    const numPerGroup = Math.ceil(tests.length / groupTotal)
    let offset = groupPos === 1 ? 0 : (groupPos - 1) * numPerGroup - 1
    // if there's an odd number of suites give the first group the extra
    if (tests.length % 2 !== 0 && groupPos !== 1) offset++
    tests = tests.splice(offset, numPerGroup)
  }

  console.log('Running tests with concurrency:', concurrency)
  const children = new Set()
  const runTests = (tests = []) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        'yarn',
        [...(BROWSER ? ['testonly', BROWSER] : ['test']), ...tests],
        {
          stdio: 'inherit',
          env: {
            ...process.env
          }
        }
      )
      children.add(child)
      child.on('exit', code => {
        children.delete(child)
        if (code) reject(new Error(`failed with code: ${code}`))
        resolve()
      })
    })

  const numTestsEach = tests.length / concurrency
  const testGroups = []

  for (let i = 0; i < concurrency; i++) {
    testGroups.push(
      tests.splice(0, i === concurrency - 1 ? tests.length : numTestsEach)
    )
  }

  await Promise.all(testGroups.map(group => runTests(group))).catch(err => {
    children.forEach(child => {
      child.kill()
      children.delete(child)
    })
    console.error(err)
  })
})()
