// @ts-check
import execa from 'execa'
import getChangedTests from './get-changed-tests.mjs'

async function main() {
  const testMode = process.argv.includes('--dev-mode')
    ? 'dev'
    : process.argv.includes('--deploy-mode')
      ? 'deploy'
      : 'start'
  const isFlakeDetection = process.argv.includes('--flake-detection')

  const { devTests, prodTests } = await getChangedTests()

  /** @type import('execa').Options */
  const EXECA_OPTS = { shell: true }
  /** @type import('execa').Options */
  const EXECA_OPTS_STDIO = { ...EXECA_OPTS, stdio: 'inherit' }

  const currentTests = testMode === 'dev' ? devTests : prodTests

  if (currentTests.length === 0) {
    console.log(`No added/changed tests detected`)
    return
  }

  const RUN_TESTS_ARGS = ['run-tests.js', '-c', '1']

  // when checking for flakes, run the tests with 0 retries
  // since we handle the retry logic below
  if (isFlakeDetection) {
    RUN_TESTS_ARGS.push('--retries', '0')
  }

  // when checking for flakes, run the entire test suite 3 times
  const attempts = isFlakeDetection ? 3 : 1

  if (process.env.TARBALL_URL) {
    console.log(
      `Running tests provided Next tarball: ${process.env.TARBALL_URL}`
    )
  }

  for (let i = 0; i < attempts; i++) {
    console.log(`\n\nRun ${i + 1} for ${testMode} tests`)
    await execa('node', [...RUN_TESTS_ARGS, ...currentTests], {
      ...EXECA_OPTS_STDIO,
      env: {
        ...process.env,
        NEXT_TEST_MODE: testMode,
        NEXT_TEST_VERSION: process.env.TARBALL_URL,
      },
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
