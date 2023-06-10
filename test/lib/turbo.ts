/**
 * Utility function to determine if a given test case needs to run with --turbo.
 *
 * This is primarily for the gradual test enablement with latest turbopack upstream changes.
 *
 * Note: it could be possible to dynamically create test cases itself (createDevTest(): it.each([...])), but
 * it makes hard to conform with existing lint rules. Instead, starting off from manual fixture setup and
 * update test cases accordingly as turbopack changes enable more test cases.
 */
export function shouldRunTurboDevTest(): boolean {
  if (!!process.env.TEST_WASM) {
    return false
  }

  const shouldRunTurboDev = !!process.env.__INTERNAL_NEXT_DEV_TEST_TURBO_DEV
  // short-circuit to run all the test with --turbo enabled skips glob matching costs
  if (shouldRunTurboDev) {
    console.log(
      `Running tests with --turbo via custom environment variable __INTERNAL_NEXT_DEV_TEST_TURBO_DEV`
    )
    return true
  }

  const shouldRunTurboDevWithMatches =
    !!process.env.__INTERNAL_NEXT_DEV_TEST_TURBO_GLOB_MATCH

  // By default, we do not run any tests with `--turbo` flag.
  if (!shouldRunTurboDevWithMatches) {
    return false
  }

  const glob = require('glob')
  const matches = glob.sync(
    process.env.__INTERNAL_NEXT_DEV_TEST_TURBO_GLOB_MATCH
  )
  const testPath = expect.getState().testPath
  const isMatch = matches.some((match) => testPath.includes(match))

  if (isMatch) {
    console.log(
      `Running tests with --turbo via custom environment variable __INTERNAL_NEXT_DEV_TEST_TURBO_GLOB_MATCH`
    )
  }

  // If the test path matches the glob pattern, add additional case to run the test with `--turbo` flag.
  return isMatch
}
