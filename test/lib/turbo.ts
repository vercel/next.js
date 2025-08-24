let loggedTurbopack = false

export function shouldUseTurbopack(): boolean {
  if (!!process.env.NEXT_TEST_WASM) {
    return false
  }

  const enabled = !!process.env.IS_TURBOPACK_TEST
  if (enabled && !loggedTurbopack) {
    require('console').log(
      `Running tests with turbopack because environment variable IS_TURBOPACK_TEST is set`
    )
    loggedTurbopack = true
  }

  return enabled
}
