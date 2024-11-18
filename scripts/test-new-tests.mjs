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
  const isFlakeDetectionMode = argv['flake-detection']
  const attempts = isFlakeDetectionMode ? 3 : 1

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
    console.log(`Verifying artifacts for commit ${commitSha}`)
    // Attempt to fetch the deploy artifacts for the commit
    // These might take a moment to become available, so we'll retry a few times
    const fetchWithRetry = async (url, retries = 5, timeout = 5000) => {
      for (let i = 0; i < retries; i++) {
        const res = await fetch(url)
        if (res.ok) {
          return res
        } else if (i < retries - 1) {
          console.log(
            `Attempt ${i + 1} failed. Retrying in ${timeout / 1000} seconds...`
          )
          await new Promise((resolve) => setTimeout(resolve, timeout))
        } else {
          if (res.status === 404) {
            throw new Error(
              `Artifacts not found for commit ${commitSha}. ` +
                `This can happen if the preview builds either failed or didn't succeed yet. ` +
                `Once the "Deploy Preview tarball" job has finished, a retry should fix this error.`
            )
          }
          throw new Error(
            `Failed to verify artifacts for commit ${commitSha}: ${res.status}`
          )
        }
      }
    }

    try {
      await fetchWithRetry(nextTestVersion)
      console.log(`Artifacts verified for commit ${commitSha}`)
    } catch (error) {
      console.error(error.message)
      throw error
    }
  }

  for (let i = 0; i < attempts; i++) {
    console.log(`\n\nRun ${i + 1}/${attempts} for ${testMode} tests (Webpack)`)
    await execa('node', [...RUN_TESTS_ARGS, ...currentTests], {
      ...EXECA_OPTS_STDIO,
      env: {
        ...process.env,
        NEXT_TEST_MODE: testMode,
        NEXT_TEST_VERSION: nextTestVersion,
        NEXT_EXTERNAL_TESTS_FILTERS:
          testMode === 'deploy' ? 'test/deploy-tests-manifest.json' : undefined,
      },
    })
  }

  if (isFlakeDetectionMode && testMode !== 'deploy') {
    for (let i = 0; i < attempts; i++) {
      console.log(
        `\n\nRun ${i + 1}/${attempts} for ${testMode} tests (Turbopack)`
      )
      await execa('node', [...RUN_TESTS_ARGS, ...currentTests], {
        ...EXECA_OPTS_STDIO,
        env: {
          ...process.env,
          NEXT_TEST_MODE: testMode,
          NEXT_TEST_VERSION: nextTestVersion,
          TURBOPACK: '1',
          TURBOPACK_BUILD: testMode === 'start' ? '1' : undefined,
          NEXT_EXTERNAL_TESTS_FILTERS:
            testMode === 'dev'
              ? 'test/turbopack-dev-tests-manifest.json'
              : 'test/turbopack-build-tests-manifest.json',
        },
      })
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
