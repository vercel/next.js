const fs = require('fs/promises')
const path = require('path')

const { createClient } = require('@vercel/kv')

async function collectExamplesResult(manifestFile) {
  const file = path.join(process.cwd(), manifestFile)
  const contents = await fs.readFile(file, 'utf-8')
  const results = JSON.parse(contents)

  let failingCount = 0
  let passingCount = 0

  const currentDate = new Date()
  const isoString = currentDate.toISOString()
  const timestamp = isoString.slice(0, 19).replace('T', ' ')

  for (const isPassing of Object.values(results)) {
    if (isPassing) {
      passingCount += 1
    } else {
      failingCount += 1
    }
  }
  const status = `${process.env.GITHUB_SHA}\t${timestamp}\t${passingCount}/${
    passingCount + failingCount
  }`

  return {
    status,
    // Uses JSON.stringify to create minified JSON, otherwise whitespace is preserved.
    data: JSON.stringify(results),
  }
}

async function collectResults(manifestFile) {
  const file = path.join(process.cwd(), manifestFile)
  const contents = await fs.readFile(file, 'utf-8')
  const results = JSON.parse(contents)

  let passingTests = ''
  let failingTests = ''
  let passCount = 0
  let failCount = 0

  const currentDate = new Date()
  const isoString = currentDate.toISOString()
  const timestamp = isoString.slice(0, 19).replace('T', ' ')

  if (results.version === 2) {
    for (const [testFileName, result] of Object.entries(results.suites)) {
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
  } else {
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
}

async function main() {
  try {
    const developmentResult = await collectResults(
      'test/turbopack-dev-tests-manifest.json'
    )
    const productionResult = await collectResults(
      'test/turbopack-build-tests-manifest.json'
    )
    const developmentExamplesResult = await collectExamplesResult(
      'test/turbopack-dev-examples-manifest.json'
    )

    const kv = createClient({
      url: process.env.TURBOYET_KV_REST_API_URL,
      token: process.env.TURBOYET_KV_REST_API_TOKEN,
    })

    console.log('TEST RESULT DEVELOPMENT')
    console.log(developmentResult.testRun)

    console.log('TEST RESULT PRODUCTION')
    console.log(productionResult.testRun)

    console.log('EXAMPLES RESULT')
    console.log(developmentExamplesResult.status)

    await kv.rpush('test-runs', developmentResult.testRun)
    await kv.rpush('test-runs-production', productionResult.testRun)
    await kv.rpush('examples-runs', developmentExamplesResult.status)
    console.log('SUCCESSFULLY SAVED RUNS')

    await kv.set('passing-tests', developmentResult.passingTests)
    await kv.set('passing-tests-production', productionResult.passingTests)
    console.log('SUCCESSFULLY SAVED PASSING')

    await kv.set('failing-tests', developmentResult.failingTests)
    await kv.set('failing-tests-production', productionResult.failingTests)
    console.log('SUCCESSFULLY SAVED FAILING')

    await kv.set('examples-data', developmentExamplesResult.data)
    console.log('SUCCESSFULLY SAVED EXAMPLES')
  } catch (error) {
    console.log(error)
  }
}

main()
