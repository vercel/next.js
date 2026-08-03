// @ts-check
import execa from 'execa'
import yargs from 'yargs'
import getChangedTests from './get-changed-tests.mjs'
import {
  assertPreviewTarballPublished,
  previewTarballUrl,
} from './wait-for-preview-tarball.mjs'

/**
 * Run tests for added/changed tests in the current branch
 * CLI Options:
 * --mode: test mode (dev, deploy, start)
 * --group: current group number / total groups
 * --flake-detection: run tests multiple times to detect flaky
 */
async function main() {
  const argv = await yargs(process.argv.slice(2))
    .string('mode')
    .string('group')
    .string('preview-builds-base-url')
    .boolean('flake-detection').argv

  const testMode = argv.mode
  const isFlakeDetectionMode = argv['flake-detection']
  const attempts = isFlakeDetectionMode ? 3 : 1
  // Left unset when the workflow passes an empty value, so that
  // wait-for-preview-tarball.mjs owns the default.
  const previewBuildsBaseUrl = argv['preview-builds-base-url']

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

  const { devTests, prodTests, deployTests, commitSha } =
    await getChangedTests()

  let currentTests =
    testMode === 'dev'
      ? devTests
      : testMode === 'deploy'
        ? deployTests
        : prodTests

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
  // as tests will run against the local version of Next.js.
  // Always use the commit SHA endpoint to avoid GitHub API rate limits on the
  // PR number endpoint (which resolves the PR to a SHA on every request).
  const nextTestVersion =
    testMode === 'deploy'
      ? previewTarballUrl(previewBuildsBaseUrl, commitSha)
      : undefined

  if (nextTestVersion) {
    // The `wait-for-preview-tarball` job in build_and_test.yml does the
    // waiting, so this only asserts. It keeps a missing tarball reported as a
    // missing tarball, rather than as an install failure from run-tests.js
    // resolving NEXT_TEST_VERSION.
    await assertPreviewTarballPublished({
      commitSha,
      previewBuildsBaseUrl,
      readToken: process.env.PREVIEW_BUILDS_READ_TOKEN,
    })
  }

  // We apply the external tests filter before the process.env so that if
  // it's defined in the environment, it overrides the default filter.
  // This is required for supporting the experimental tests setup.
  const NEXT_EXTERNAL_TESTS_FILTERS = process.env.NEXT_EXTERNAL_TESTS_FILTERS
    ? process.env.NEXT_EXTERNAL_TESTS_FILTERS
    : testMode === 'deploy'
      ? 'test/deploy-tests-manifest.json'
      : undefined

  if (NEXT_EXTERNAL_TESTS_FILTERS) {
    console.log(
      `Applying external tests filter: ${NEXT_EXTERNAL_TESTS_FILTERS}`
    )
  }

  if (isFlakeDetectionMode) {
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
          NEXT_TEST_PREVIEW_BUILDS_BASE_URL: previewBuildsBaseUrl,
          NEXT_EXTERNAL_TESTS_FILTERS,
          NEXT_FLAKE_DETECTION: '1',
          IS_TURBOPACK_TEST: '1',
          TURBOPACK_BUILD:
            testMode === 'start' || testMode === 'deploy' ? '1' : undefined,
          TURBOPACK_DEV: testMode === 'dev' ? '1' : undefined,
        },
      })
    }
  } else {
    for (let i = 0; i < attempts; i++) {
      console.log(`\n\nRun ${i + 1}/${attempts} for ${testMode} tests`)

      await execa('node', [...RUN_TESTS_ARGS, ...currentTests], {
        ...EXECA_OPTS_STDIO,
        env: {
          ...process.env,
          NEXT_EXTERNAL_TESTS_FILTERS,
          NEXT_TEST_MODE: testMode,
          NEXT_TEST_VERSION: nextTestVersion,
          NEXT_TEST_PREVIEW_BUILDS_BASE_URL: previewBuildsBaseUrl,
          TURBOPACK_BUILD:
            process.env.IS_TURBOPACK_TEST &&
            (testMode === 'start' || testMode === 'deploy')
              ? '1'
              : undefined,
          TURBOPACK_DEV:
            process.env.IS_TURBOPACK_TEST && testMode === 'dev'
              ? '1'
              : undefined,
          NEXT_TEST_SKIP_RESULT_CACHE: '1',
        },
      })
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
