const fs = require('fs/promises')
const path = require('path')

const { createClient } = require('@vercel/kv')

async function main() {
  try {
    const file = path.join(process.cwd(), 'test/turbopack-tests-manifest.json')

    let passingTests = ''
    let failingTests = ''
    let passCount = 0
    let failCount = 0

    const contents = await fs.readFile(file, 'utf-8')
    const results = JSON.parse(contents)

    const currentDate = new Date()
    const isoString = currentDate.toISOString()
    const timestamp = isoString.slice(0, 19).replace('T', ' ')

    for (const [testFileName, result] of Object.entries(results)) {
      let suitePassCount = 0
      let suiteFailCount = 0

      suitePassCount += result.passed.length
      suiteFailCount += result.failed.length

      if (suitePassCount > 0) {
        passingTests += `${testFileName}\n`
      }

      if (suiteFailCount > 0) {
        failingTests += `${testFileName}\n`
      }

      for (const passed of result.passed) {
        const passedName = passed.replaceAll('`', '\\`')
        passingTests += `* ${passedName}\n`
      }

      for (const passed of result.failed) {
        const failedName = passed.replaceAll('`', '\\`')
        failingTests += `* ${failedName}\n`
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

    const testRun = `${process.env.GITHUB_SHA}\t${timestamp}\t${passCount}/${
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
