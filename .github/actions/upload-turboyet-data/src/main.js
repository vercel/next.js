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

async function collectAndUpload(
  kv,
  { jsonPrefix, kvPrefix, deploymentDomain }
) {
  const developmentResult = await collectResults(
    `test/${jsonPrefix}dev-tests-manifest.json`
  )
  const productionResult = await collectResults(
    `test/${jsonPrefix}build-tests-manifest.json`
  )
  const developmentExamplesResult = await collectExamplesResult(
    `test/${jsonPrefix}dev-examples-manifest.json`
  )

  console.log('TEST RESULT DEVELOPMENT')
  console.log(developmentResult.testRun)

  console.log('TEST RESULT PRODUCTION')
  console.log(productionResult.testRun)

  console.log('EXAMPLES RESULT')
  console.log(developmentExamplesResult.status)

  await kv.rpush(`${kvPrefix}test-runs`, developmentResult.testRun)
  await kv.rpush(`${kvPrefix}test-runs-production`, productionResult.testRun)
  await kv.rpush(`${kvPrefix}examples-runs`, developmentExamplesResult.status)
  console.log('SUCCESSFULLY SAVED RUNS')

  await kv.set(`${kvPrefix}passing-tests`, developmentResult.passingTests)
  await kv.set(
    `${kvPrefix}passing-tests-production`,
    productionResult.passingTests
  )
  console.log('SUCCESSFULLY SAVED PASSING')

  await kv.set(`${kvPrefix}failing-tests`, developmentResult.failingTests)
  await kv.set(
    `${kvPrefix}failing-tests-production`,
    productionResult.failingTests
  )
  console.log('SUCCESSFULLY SAVED FAILING')

  await kv.set(`${kvPrefix}examples-data`, developmentExamplesResult.data)
  console.log('SUCCESSFULLY SAVED EXAMPLES')

  if (deploymentDomain != null) {
    // Upstash does not provide strong consistency, so just wait a couple
    // seconds before invalidating the cache in case of replication lag.
    //
    // https://upstash.com/docs/redis/features/consistency
    await new Promise((resolve) => setTimeout(resolve, 2000))
    try {
      const response = await fetch(
        `https://${deploymentDomain}/api/revalidate`,
        {
          method: 'POST',
          headers: {
            'X-Auth-Token': process.env.TURBOYET_TOKEN,
            'Content-Type': 'application/json',
          },
        }
      )
      const responseJson = await response.json()
      if (!responseJson.revalidated) {
        throw new Error(responseJson.error)
      }
      console.log('SUCCESSFULLY REVALIDATED VERCEL DATA CACHE')
    } catch (error) {
      // non-fatal: the cache will eventually expire anyways
      console.error('FAILED TO REVALIDATE VERCEL DATA CACHE', error)
    }
  }
}

async function main() {
  try {
    const kv = createClient({
      url: process.env.TURBOYET_KV_REST_API_URL,
      token: process.env.TURBOYET_KV_REST_API_TOKEN,
    })
    console.log('### UPLOADING TURBOPACK DATA')
    await collectAndUpload(kv, {
      jsonPrefix: 'turbopack-',
      kvPrefix: '',
      deploymentDomain: 'areweturboyet.com',
    })
    console.log('### UPLOADING RSPACK DATA')
    await collectAndUpload(kv, {
      jsonPrefix: 'rspack-',
      kvPrefix: 'rspack-',
      deploymentDomain: 'arewerspackyet.com',
    })
  } catch (error) {
    console.log(error)
  }
}

main()
