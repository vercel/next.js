const fs = require('fs/promises')
const path = require('path')

const { createClient } = require('@vercel/kv')

async function main() {
  try {
    const file = path.join(
      process.cwd(),
      './test-results/nextjs-test-results.json'
    )

    let passingTests = ''
    let failingTests = ''
    let passCount = 0
    let failCount = 0

    const contents = await fs.readFile(file, 'utf-8')
    const results = JSON.parse(contents)
    let { ref } = results
    const currentDate = new Date()
    const isoString = currentDate.toISOString()
    const timestamp = isoString.slice(0, 19).replace('T', ' ')

    for (const result of results.result) {
      let suitePassCount = 0
      let suiteFailCount = 0

      suitePassCount += result.data.numPassedTests
      suiteFailCount += result.data.numFailedTests

      let suiteName = result.data.testResults[0].name
      // remove "/home/runner/work/turbo/turbo/" from the beginning of suiteName
      suiteName = suiteName.slice(30)
      if (suitePassCount > 0) {
        passingTests += `${suiteName}\n`
      }

      if (suiteFailCount > 0) {
        failingTests += `${suiteName}\n`
      }

      for (const assertionResult of result.data.testResults[0]
        .assertionResults) {
        let assertion = assertionResult.fullName.replaceAll('`', '\\`')
        if (assertionResult.status === 'passed') {
          passingTests += `* ${assertion}\n`
        } else if (assertionResult.status === 'failed') {
          failingTests += `* ${assertion}\n`
        }
      }

      passCount += suitePassCount
      failCount += suiteFailCount

      if (suitePassCount > 0) {
        passingTests += `\n`
      }

      if (suiteFailCount > 0) {
        failingTests += `\n`
      }
    }

    const kv = createClient({
      url: process.env.TURBOYET_KV_REST_API_URL,
      token: process.env.TURBOYET_KV_REST_API_TOKEN,
    })

    const testRun = `${ref}\t${timestamp}\t${passCount}/${
      passCount + failCount
    }`

    console.log('TEST RESULT')
    console.log(testRun)

    await kv.rpush('test-runs', testRun)
    console.log('SUCCESSFULLY SAVED RUNS')

    await kv.set('passing-tests', passingTests)
    console.log('SUCCESSFULLY SAVED PASSING')

    await kv.set('failing-tests', failingTests)
    console.log('SUCCESSFULLY SAVED FAILING')
  } catch (error) {
    console.log(error)
  }
}

main()
