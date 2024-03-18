const fs = require('fs/promises')
const path = require('path')

const { createClient } = require('@vercel/kv')

async function collectResults(manifestFile) {
  const file = path.join(process.cwd(), manifestFile)

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
  const testRun = `${process.env.GITHUB_SHA}\t${timestamp}\t${passCount}/${
    passCount + failCount
  }`

  return { testRun, passingTests, failingTests }
}

async function main() {
  try {
    const developmentResult = await collectResults(
      'test/turbopack-dev-tests-manifest.json'
    )

    const productionResult = await collectResults(
      'test/turbopack-build-tests-manifest.json'
    )

    const kv = createClient({
      url: process.env.TURBOYET_KV_REST_API_URL,
      token: process.env.TURBOYET_KV_REST_API_TOKEN,
    })

    console.log('TEST RESULT DEVELOPMENT')
    console.log(developmentResult.testRun)

    console.log('TEST RESULT PRODUCTION')
    console.log(productionResult.testRun)

    await kv.rpush('test-runs', developmentResult.testRun)
    await kv.rpush('test-runs-production', productionResult.testRun)
    console.log('SUCCESSFULLY SAVED RUNS')

    await kv.set('passing-tests', developmentResult.passingTests)
    await kv.set('passing-tests-production', productionResult.passingTests)
    console.log('SUCCESSFULLY SAVED PASSING')

    await kv.set('failing-tests', developmentResult.failingTests)
    await kv.set('failing-tests-production', productionResult.failingTests)
    console.log('SUCCESSFULLY SAVED FAILING')
  } catch (error) {
    console.log(error)
  }
}

main()
