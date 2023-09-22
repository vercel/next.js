const fetch = require('node-fetch')
const fs = require('fs')

// TODO: Switch to nextjs-integration-test-data branch once https://github.com/vercel/turbo/pull/5999 is merged.
const RESULT_URL =
  'https://raw.githubusercontent.com/vercel/turbo/jrl-known-location-nextjs-integration-test-data/test-results/main/nextjs-test-results.json'
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
