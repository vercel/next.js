/// A script to remove / add next.js tests into the lists if there are any changes.

const fs = require('fs')
const _glob = require('glob')
const { promisify } = require('util')
const glob = promisify(_glob)
const path = require('path')

const generateManifest = (enabledTests, disabledTests) => `
// Tests that are currently enabled with Turbopack in CI.
// Add new test when Turbopack updates to fix / implement a feature.
const enabledTests = ${enabledTests}

// Tests that are currently disabled with Turbopack in CI.
const disabledTests = ${disabledTests}

module.exports = {
  enabledTests,
  disabledTests,
}`

const main = async () => {
  // Read existing manifests
  let enabledTests = []
  let disabledTests = []

  const manifestPath = path.resolve(__dirname, 'tests-manifest.js')
  if (fs.existsSync(manifestPath)) {
    const manifest = require(manifestPath)
    enabledTests = manifest.enabledTests
    disabledTests = manifest.disabledTests
  } else {
    throw new Error('a')
  }

  // Collect all test files
  const testFiles = (
    await glob('**/*.test.{js,ts,tsx}', {
      nodir: true,
      cwd: path.resolve(__dirname, '../../../../test'),
    })
  ).map((file) => `test/${file}`)

  // Naively update enabled / disabled tests to the latest.
  // This is not the most efficient way to do this, but it's good enough for now.

  // First, remove enabled tests that are no longer in the test directory.
  enabledTests = enabledTests.filter((testFile) => testFiles.includes(testFile))
  // Anything else are disabled.
  disabledTests = testFiles.filter(
    (testFile) => !enabledTests.includes(testFile)
  )

  fs.writeFileSync(
    manifestPath,
    generateManifest(
      JSON.stringify(enabledTests, null, 2),
      JSON.stringify(disabledTests, null, 2)
    ),
    'utf-8'
  )
}

main().catch((e) => console.error(e))
