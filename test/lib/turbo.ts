let loggedTurbopack = false
let loggedExperimentalTurbopack = false

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

  const shouldRunTurboDev = !!process.env.TURBOPACK
  if (shouldRunTurboDev && !loggedTurbopack) {
    require('console').log(
      `Running tests with turbopack because environment variable TURBOPACK is set`
    )
    loggedTurbopack = true
  }

  return shouldRunTurboDev
}

/**
 * Utility function to determine if a given test case needs to run with --experimental-turbo.
 *
 * This is primarily for the gradual test enablement with latest turbopack upstream changes.
 *
 * Note: it could be possible to dynamically create test cases itself (createDevTest(): it.each([...])), but
 * it makes hard to conform with existing lint rules. Instead, starting off from manual fixture setup and
 * update test cases accordingly as turbopack changes enable more test cases.
 */
export function shouldRunExperimentalTurboDevTest(): boolean {
  if (!!process.env.TEST_WASM) {
    return false
  }

  const shouldRunExperimentalTurboDev = !!process.env.EXPERIMENTAL_TURBOPACK
  if (shouldRunExperimentalTurboDev && !loggedExperimentalTurbopack) {
    require('console').log(
      `Running tests with experimental turbopack because environment variable EXPERIMENTAL_TURBOPACK is set`
    )
    loggedExperimentalTurbopack = true
  }

  return shouldRunExperimentalTurboDev
}

export function getTurbopackFlag(): string {
  if (!!process.env.TURBOPACK) {
    return '--turbo'
  } else if (!!process.env.EXPERIMENTAL_TURBOPACK) {
    return '--experimental-turbo'
  } else {
    throw Error(`Cannot get the flag for running turbopack`)
  }
}
