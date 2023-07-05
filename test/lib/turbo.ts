let loggedTurbopack = false

/**
 * Utility function to determine if a given test case needs to run with --turbo.
 *
 * This is primarily for the gradual test enablement with latest turbopack upstream changes.
 *
 * Note: it could be possible to dynamically create test cases itself (createDevTest(): it.each([...])), but
 * it makes hard to conform with existing lint rules. Instead, starting off from manual fixture setup and
 * update test cases accordingly as turbopack changes enable more test cases.
 */
export function shouldRunTurboDevTest(): {
  turbo: boolean
  experimental: boolean
} {
  if (!!process.env.TEST_WASM) {
    return {
      turbo: false,
      experimental: false,
    }
  }

  const shouldRunTurboDev = !!process.env.TURBOPACK
  if (shouldRunTurboDev && !loggedTurbopack) {
    require('console').log(
      `Running tests with turbopack because environment variable TURBOPACK is set`
    )
    loggedTurbopack = true
  }
  const shouldRunExperimental = !!process.env.__EXPERIMENTAL_TURBO

  if (shouldRunExperimental && !loggedTurbopack) {
    require('console').log(
      `Running tests with experimental turbopack because environment variable is set`
    )
    loggedTurbopack = true
  }

  return {
    turbo: shouldRunTurboDev,
    experimental: shouldRunExperimental,
  }
}
