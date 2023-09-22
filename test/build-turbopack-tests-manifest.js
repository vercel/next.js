const fetch = require('node-fetch')
const fs = require('fs')

const override = process.argv.includes('--override')

// TODO: Switch to nextjs-integration-test-data branch once https://github.com/vercel/turbo/pull/5999 is merged.
const RESULT_URL =
  'https://raw.githubusercontent.com/vercel/turbo/nextjs-integration-test-data/test-results/main/nextjs-test-results.json'
const PASSING_JSON_PATH = `${__dirname}/turbopack-tests-manifest.json`
const WORKING_PATH = '/home/runner/work/turbo/turbo/'

async function updatePassingTests() {
  const passing = { __proto__: null }
  const res = await fetch(RESULT_URL)
  const results = await res.json()

  for (const result of results.result) {
    for (const testResult of result.data.testResults) {
      const filepath = stripWorkingPath(testResult.name)
      for (const file of duplicateFileNames(filepath)) {
        const fileResults = (passing[file] ??= {
          passed: [],
          failed: [],
          pending: [],
        })

        for (const testCase of testResult.assertionResults) {
          const { fullName, status } = testCase
          const statusArray = fileResults[status]
          if (!statusArray) {
            throw new Error(`unexpected status "${status}"`)
          }
          statusArray.push(fullName)
        }
      }
    }
  }

  const oldPassingData = JSON.parse(fs.readFileSync(PASSING_JSON_PATH, 'utf8'))

  for (const file of Object.keys(oldPassingData)) {
    const newData = passing[file]
    const oldData = oldPassingData[file]
    if (!newData) continue
    newData.passed = newData.passed.filter(
      (name) => !newData.failed.includes(name)
    )
    const shouldPass = new Set(
      oldData.passed.filter((name) => newData.failed.includes(name))
    )
    if (override) {
    } else {
      if (shouldPass.size > 0) {
        const list = JSON.stringify([...shouldPass], 0, 2)
        console.log(
          `${file} has ${shouldPass.size} tests should pass but failed: ${list}`
        )
      }
      newData.passed = [...new Set([...newData.passed, ...shouldPass])]
      newData.failed = newData.failed.filter((name) => !shouldPass.has(name))
    }
  }

  fs.writeFileSync(PASSING_JSON_PATH, JSON.stringify(passing, null, 2))
}

function stripWorkingPath(path) {
  if (!path.startsWith(WORKING_PATH)) {
    throw new Error(
      `found unexpected working path in "${path}", expected it to begin with ${WORKING_PATH}`
    )
  }
  return path.slice(WORKING_PATH.length)
}

function duplicateFileNames(path) {
  if (path.includes('/src/')) {
    const dist = path.replace('/src/', '/dist/').replace(/.tsx?$/, '.js')
    if (fs.existsSync(`${__dirname}/../${dist}`)) {
      return [path, dist]
    }
  }
  return [path]
}

updatePassingTests()
