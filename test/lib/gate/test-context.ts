/**
 * The statically-known shape of the current test run, published by `e2e-utils`
 * when it is imported and read by the static conditions in `./conditions.ts`.
 *
 * `e2e-utils` derives all of this at module scope (from `NEXT_TEST_MODE`, the
 * test's folder, and the bundler env vars), and a test file imports `e2e-utils`
 * before any `_test_gate(...)` call runs, so the context is always populated by
 * the time a gate is evaluated in an e2e suite.
 *
 * It lives in its own module so that the gate runtime — which is loaded for
 * every Jest project, including unit tests — never has to import `e2e-utils`
 * and its side effects.
 */

export type GateTestMode = 'dev' | 'start' | 'deploy'
export type GateTestBundler = 'turbopack' | 'rspack' | 'webpack'

export type GateTestContext = {
  mode: GateTestMode
  bundler: GateTestBundler
  react18: boolean
  wasm: boolean
}

let current: GateTestContext | null = null

export function setGateTestContext(context: GateTestContext): void {
  current = context
}

export function getGateTestContext(): GateTestContext {
  if (!current) {
    throw new Error(
      `This \`@gate\` condition describes the e2e test run (mode, bundler, ` +
        `React version), but no run context has been recorded. Conditions ` +
        `like \`dev\` and \`turbopack\` are only available to suites that ` +
        `import \`e2e-utils\`.`
    )
  }
  return current
}

/** Test-only. */
export function clearGateTestContext(): void {
  current = null
}
