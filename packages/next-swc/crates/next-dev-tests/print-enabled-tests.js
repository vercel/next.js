/// A script that prints a list of test cases that are enabled

const _glob = require('glob')
const { promisify } = require('util')
const glob = promisify(_glob)
const path = require('path')

const { disabledTests } = require('./tests-manifest.js')

const main = async () => {
  // Collect all test files
  const testFiles = new Set(
    (
      await glob('**/*.test.{js,ts,tsx}', {
        nodir: true,
        cwd: path.resolve(__dirname, '../../../../test'),
      })
    ).map((file) => `test/${file}`)
  )

  for (const testFile of disabledTests) {
    testFiles.delete(testFile)
  }

  for (const testFile of testFiles) {
    console.log(testFile)
  }
}

main().catch((e) => console.error(e))
