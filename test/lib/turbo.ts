let loggedTurbopack = false

export function shouldUseTurbopack(): boolean {
  if (!!process.env.NEXT_TEST_WASM) {
    return false
  }

  const shouldRunTurboDev = !!process.env.IS_TURBOPACK_TEST
  if (shouldRunTurboDev && !loggedTurbopack) {
    require('console').log(
      `Running tests with turbopack because environment variable TURBOPACK is set`
    )
    loggedTurbopack = true
  }

  return shouldRunTurboDev
}
