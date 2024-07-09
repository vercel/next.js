// @ts-check
import execa from 'execa'
import yargs from 'yargs'
import getChangedTests from './get-changed-tests.mjs'

/**
 * Run tests for added/changed tests in the current branch
 * CLI Options:
 * --mode: test mode (dev, deploy, start)
 * --group: current group number / total groups
 * --flake-detection: run tests multiple times to detect flaky
 */
async function main() {
  let argv = await yargs(process.argv.slice(2))
    .string('mode')
    .string('group')
    .boolean('flake-detection').argv

  let testMode = argv.mode
  const attempts = argv['flake-detection'] ? 3 : 1

  if (testMode && !['dev', 'deploy', 'start'].includes(testMode)) {
    throw new Error(
      `Invalid test mode: ${testMode}. Must be one of: dev, deploy, start`
    )
  }

  const rawGroup = argv['group']
  let currentGroup = 1
  let groupTotal = 1

  if (rawGroup) {
    ;[currentGroup, groupTotal] = rawGroup
      .split('/')
      .map((item) => Number(item))
  }

  /** @type import('execa').Options */
  const EXECA_OPTS = { shell: true }
  /** @type import('execa').Options */
  const EXECA_OPTS_STDIO = { ...EXECA_OPTS, stdio: 'inherit' }

  const { devTests, prodTests, commitSha } = await getChangedTests()

  let currentTests = testMode === 'dev' ? devTests : prodTests

  /**
    @type {Array<string[]>}
  */
  const fileGroups = []

  for (const test of currentTests) {
    let smallestGroup = fileGroups[0]
    let smallestGroupIdx = 0

    // get the smallest group time to add current one to
    for (let i = 0; i < groupTotal; i++) {
      if (!fileGroups[i]) {
        fileGroups[i] = []
      }

      if (
        smallestGroup &&
        fileGroups[i] &&
        fileGroups[i].length < smallestGroup.length
      ) {
        smallestGroup = fileGroups[i]
        smallestGroupIdx = i
      }
    }
    fileGroups[smallestGroupIdx].push(test)
  }
  currentTests = fileGroups[currentGroup - 1] || []

  if (currentTests.length === 0) {
    console.log(`No added/changed tests detected`)
    return
  }

  const RUN_TESTS_ARGS = ['run-tests.js', '-c', '1', '--retries', '0']

  // Only override the test version for deploy tests, as they need to run against
  // the artifacts for the pull request. Otherwise, we don't need to specify this property,
  // as tests will run against the local version of Next.js
  const nextTestVersion =
    testMode === 'deploy'
      ? `https://vercel-packages.vercel.app/next/commits/${commitSha}/next`
      : undefined

  if (nextTestVersion) {
    // Verify the artifacts for the commit SHA exist before running the tests
    console.log(`Verifying artifacts for commit ${commitSha}`)
    const res = await fetch(nextTestVersion)

    if (!res.ok) {
      throw new Error(
        `Failed to verify artifacts for commit ${commitSha}: ${res.status}`
      )
    }
  }

  for (let i = 0; i < attempts; i++) {
    console.log(`\n\nRun ${i + 1}/${attempts} for ${testMode} tests`)
    await execa('node', [...RUN_TESTS_ARGS, ...currentTests], {
      ...EXECA_OPTS_STDIO,
      env: {
        ...process.env,
        NEXT_TEST_MODE: testMode,
        NEXT_TEST_VERSION: nextTestVersion,
      },
    })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
