/**
 * The `@gate` runtime.
 *
 * `test/lib/gate/pragma-transform.js` rewrites
 *
 * ```
 * // @gate !cacheComponents
 * it('name', body)
 * ```
 *
 * into `_test_gate([{force: false, source: '!cacheComponents'}], 'it')('name', body)`,
 * and this module installs that `_test_gate` global.
 *
 * ## What a gate does
 *
 * `// @gate <condition>` **always runs the test**. If the condition is true the
 * test behaves normally. If the condition is false the expectation is inverted:
 * a failing body is reported as a pass, and a *passing* body is reported as a
 * failure — "the gate is stale, delete it". That inversion is the whole point.
 * An `it.skip` is a dead end that nobody revisits; a `@gate` is a tripwire that
 * fires the day the underlying bug is fixed.
 *
 * Conditions are declared in `./conditions.ts`. Static ones (mode, bundler)
 * are known at collection time, so a false static `@gate` registers the test
 * through Jest's own `test.failing` and the inversion is native. Lazy ones are
 * read from the booted fixture's resolved config the first time a gate asks,
 * which can only happen inside the test body — those tests wrap the body and
 * invert the outcome at runtime.
 *
 * ## `@force-gate`
 *
 * `// @force-gate <condition>` skips the test for real (`○ skipped`) when the
 * condition is false. That requires a decision at collection time, so it only
 * accepts static conditions, and it gives up the stale-gate tripwire entirely.
 * Prefer `@gate`; reach for `@force-gate` only when running the body is
 * impossible rather than merely failing — dev mode has no build output, deploy
 * mode cannot touch the filesystem.
 */

import { evaluate, parse, type ExprNode } from './expr'
import { getCondition } from './conditions'
import { getResolvedConfigForGates, hasFixture } from './state'
import type { ResolvedNextConfig } from './resolved-config'

/** The shape the transform emits. */
export type GatePragma = {
  force: boolean
  source: string
}

export type Gate = GatePragma & {
  node: ExprNode
  names: string[]
  /** True when any referenced condition has to be read off the fixture. */
  needsResolvedConfig: boolean
}

type TestFn = (
  name: string,
  fn?: jest.ProvidesCallback,
  timeout?: number
) => void

/**
 * Gates on an enclosing `describe` apply to every test inside it, including
 * tests that carry no pragma of their own. The stack is pushed while the
 * `describe` body is being collected.
 */
const describeGateStack: Gate[] = []

/** Bodies this module already wrapped, so inherited gates are not re-applied. */
const gatedBodies = new WeakSet<Function>()

function staleGateMessage(gate: Gate): string {
  return (
    `Gated test passed unexpectedly.\n\n` +
    `This test is marked \`// @gate ${gate.source}\`, and that condition is ` +
    `currently false, so the test was expected to fail — but it passed.\n` +
    `The gate is stale: delete the \`// @gate ${gate.source}\` pragma (and ` +
    `whatever workaround came with it).`
  )
}

function parseGate(pragma: GatePragma): Gate {
  let parsed
  try {
    parsed = parse(pragma.source)
  } catch (err) {
    throw new Error(
      `Could not parse \`// @${pragma.force ? 'force-gate' : 'gate'} ${
        pragma.source
      }\`: ${(err as Error).message}`
    )
  }

  const lazyNames = parsed.names.filter(
    (name) => getCondition(name).kind === 'lazy'
  )

  // `needsResolvedConfig` also classifies a `@force-gate`. A static force-gate
  // (mode/bundler) is decided while tests are collected — a real Jest skip. A
  // *lazy* force-gate can't be known then, so it is decided at runtime once the
  // fixture's config is resolvable: it force-passes the test (and, on a
  // `describe`, skips the build) rather than emitting a collection-time skip.
  return { ...pragma, ...parsed, needsResolvedConfig: lazyNames.length > 0 }
}

function readCondition(name: string, config?: ResolvedNextConfig): unknown {
  const condition = getCondition(name)
  if (condition.kind === 'static') return condition.value()
  if (!config) {
    // Unreachable: `needsResolvedConfig` makes us resolve the config first.
    throw new Error(`\`@gate ${name}\` was evaluated without a config`)
  }
  return condition.value(config)
}

type GateDecision =
  | { type: 'run' }
  | { type: 'force-pass'; gate: Gate }
  | { type: 'invert'; gate: Gate }

/**
 * Decides what to do with a test, given the gates that apply to it. Resolves
 * the fixture config once if any gate needs it.
 *
 * A false `@force-gate` skips the test (force-pass) and takes precedence over
 * an inverted `@gate` on the same test — you can't assert-fail a test you're
 * skipping. Otherwise the first false `@gate` inverts the expectation, and if
 * every gate holds the test runs normally.
 */
async function decideGates(gates: Gate[]): Promise<GateDecision> {
  let config: ResolvedNextConfig | undefined
  if (gates.some((gate) => gate.needsResolvedConfig)) {
    config = await getResolvedConfigForGates()
  }
  const read = (name: string) => readCondition(name, config)

  for (const gate of gates) {
    if (gate.force && !evaluate(gate.node, read)) {
      return { type: 'force-pass', gate }
    }
  }
  for (const gate of gates) {
    if (!gate.force && !evaluate(gate.node, read)) {
      return { type: 'invert', gate }
    }
  }
  return { type: 'run' }
}

/** The condition values a `gate()` predicate receives. */
export type GateConditions = Record<string, unknown>

/**
 * Reads conditions by name, validating against the registry (an undeclared
 * name throws, same as a pragma). Lazy reads without a resolved config raise
 * the standard "no fixture is registered" error.
 */
function makeConditionsObject(
  config: ResolvedNextConfig | undefined
): GateConditions {
  return new Proxy({} as GateConditions, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined
      const condition = getCondition(prop)
      if (condition.kind === 'static') return condition.value()
      if (config === undefined) {
        // No fixture is registered (otherwise `gate()` resolved the config
        // before calling the predicate); this throws the explanatory error.
        void getResolvedConfigForGates()
      }
      return condition.value(config!)
    },
    has: () => true,
  })
}

/**
 * The runtime counterpart of the pragma, for conditional logic *inside* a test
 * body — the same condition registry, evaluated on demand:
 *
 * ```ts
 * import { gate } from 'next-test-utils'
 *
 * if (await gate((conditions) => conditions.cacheComponents)) {
 *   expect(...).toBe(...)
 * } else {
 *   expect(...).toBe(...)
 * }
 * ```
 *
 * The function form mirrors React's `gate(flags => flags.enableFoo)`
 * (`scripts/jest/setupTests.js`), except it is imported rather than installed
 * as a global, and it is async, because lazy conditions read the booted
 * fixture's resolved config. A string is also accepted and evaluated in the
 * pragma expression language: `await gate('cacheComponents && !dev')`.
 *
 * Unlike the pragma there is no inversion — it only answers the question — so
 * reach for it when a body should run under both states but assert
 * differently, and for tests a pragma cannot attach to (`it.each`). When the
 * whole body is a known failure, use `// @gate` instead and keep the tripwire.
 */
export async function gate(
  arg: string | ((conditions: GateConditions) => unknown)
): Promise<boolean> {
  if (typeof arg === 'string') {
    const parsed = parseGate({ force: false, source: arg })
    let config: ResolvedNextConfig | undefined
    if (parsed.needsResolvedConfig) {
      config = await getResolvedConfigForGates()
    }
    return Boolean(evaluate(parsed.node, (name) => readCondition(name, config)))
  }

  // Whether the predicate reads a lazy condition can't be known without
  // running it, so resolve the config up front whenever a fixture is
  // registered (memoized on the instance). Suites without a fixture can still
  // gate on static conditions.
  const config = hasFixture() ? await getResolvedConfigForGates() : undefined
  return Boolean(arg(makeConditionsObject(config)))
}

/**
 * Runs `callback` and throws `errorIfItPasses` if it *doesn't* fail. Adapted
 * from React's `scripts/jest/setupTests.js`.
 */
export async function expectTestToFail(
  callback: () => unknown,
  errorIfItPasses: Error
): Promise<void> {
  let didError = false
  try {
    await callback()
  } catch {
    didError = true
  }
  if (!didError) throw errorIfItPasses
}

function wrapGatedBody(
  gates: Gate[],
  callback: Function
): jest.ProvidesCallback {
  if (callback.length > 0) {
    throw new Error(
      `A gated test cannot use the \`done\` callback, because the gate has to ` +
        `observe whether the test failed. Return a promise instead.`
    )
  }

  const body = async function gatedBody(this: unknown): Promise<void> {
    const decision = await decideGates(gates)

    if (decision.type === 'run') {
      await callback.call(this)
      return
    }

    if (decision.type === 'force-pass') {
      // A lazy `@force-gate` whose condition is false: the test can't be
      // attempted here, so skip the body and report a pass. Jest can't turn a
      // running test into `○ skipped`, so this shows as passed — the warning is
      // the signal. A *static* force-gate never reaches here; it is a real skip.
      require('console').warn(
        `  ⚠ skipped by \`@force-gate ${decision.gate.source}\``
      )
      return
    }

    const error = new Error(staleGateMessage(decision.gate))
    Error.captureStackTrace(error, body)
    await expectTestToFail(() => callback.call(this), error)
    require('console').warn(
      `  ⚠ gated test failed as expected (@gate ${decision.gate.source})`
    )
  }

  gatedBodies.add(body)
  return body as jest.ProvidesCallback
}

/**
 * The body for a test registered through Jest's own `test.failing`, used when
 * a false static `@gate` is known at collection time. Jest inverts the outcome
 * natively; this wrapper only keeps the log lines consistent with the
 * runtime-inverted (lazy) path.
 */
function wrapFailingBody(
  gate: Gate,
  callback: Function
): jest.ProvidesCallback {
  if (callback.length > 0) {
    throw new Error(
      `A gated test cannot use the \`done\` callback, because the gate has to ` +
        `observe whether the test failed. Return a promise instead.`
    )
  }

  const body = async function gatedFailingBody(this: unknown): Promise<void> {
    try {
      await callback.call(this)
    } catch (error) {
      require('console').warn(
        `  ⚠ gated test failed as expected (@gate ${gate.source})`
      )
      throw error
    }
    // The body passed. Jest is about to fail this test with its generic
    // "Failing test passed even though it was supposed to fail" error, which
    // points at a `.failing` modifier the author never wrote — so explain the
    // real situation alongside it.
    require('console').warn(staleGateMessage(gate))
  }

  gatedBodies.add(body)
  return body as jest.ProvidesCallback
}

/**
 * Finds a false static `@gate` at collection time, which decides the whole
 * test early: it registers through Jest's native `test.failing` instead of
 * wrapping the body. Not applicable when a lazy `@force-gate` is also present
 * — that could override the inversion with a force-pass, so the decision has
 * to wait for the fixture's config at runtime. (If a lazy plain gate is false
 * as well, the outcome is an inversion either way; the static one is simply
 * the gate that gets named.)
 */
function findStaticInversion(gates: Gate[]): Gate | null {
  if (gates.some((gate) => gate.force && gate.needsResolvedConfig)) {
    return null
  }
  return (
    gates.find(
      (gate) =>
        !gate.force &&
        !gate.needsResolvedConfig &&
        !evaluate(gate.node, (name) => readCondition(name))
    ) ?? null
  )
}

function resolveTestFn(kind: string): TestFn {
  const g = global as any
  switch (kind) {
    case 'it':
      return g.it
    case 'test':
      return g.test
    case 'fit':
      return g.fit ?? g.it.only
    case 'it.only':
      return g.it.only
    case 'test.only':
      return g.test.only
    case 'describe':
      return g.describe
    case 'describe.only':
      return g.describe.only
    default:
      throw new Error(`\`@gate\` does not support \`${kind}(...)\``)
  }
}

/** The `.skip` counterpart of `resolveTestFn`, for a false `@force-gate`. */
function resolveSkipFn(kind: string): TestFn {
  const g = global as any
  if (kind.startsWith('describe')) return g.describe.skip
  if (kind.startsWith('test')) return g.test.skip
  return g.it.skip
}

export function _test_gate(pragmas: GatePragma[], kind: string) {
  // Parsing and validation happen while the test file is being collected, so a
  // typo'd condition fails the whole suite instead of one test.
  const allGates = pragmas.map(parseGate)
  // A static `@force-gate` is decided at collection time (a real Jest skip).
  // Everything else — `@gate`, and *lazy* `@force-gate` — is resolved at
  // runtime, so it inherits down into the tests via the describe stack.
  const staticForceGates = allGates.filter(
    (gate) => gate.force && !gate.needsResolvedConfig
  )
  const runtimeGates = allGates.filter(
    (gate) => !gate.force || gate.needsResolvedConfig
  )
  const isDescribe = kind.startsWith('describe')
  const testFn = resolveTestFn(kind)

  return function gated(name: string, callback: Function, timeout?: number) {
    // A false static `@force-gate` is a real Jest skip, decided right here.
    const forcedOff = staticForceGates.find(
      (gate) => !evaluate(gate.node, (condition) => readCondition(condition))
    )
    if (forcedOff) {
      return resolveSkipFn(kind)(
        name,
        callback as jest.ProvidesCallback,
        timeout
      )
    }

    if (isDescribe) {
      // Register the `describe` normally, but make its runtime gates (including
      // a lazy `@force-gate`) visible while its body is collected so nested
      // tests inherit them and `nextTestSetup` can gate the build.
      return testFn(name, function (this: unknown) {
        describeGateStack.push(...runtimeGates)
        try {
          return callback.call(this)
        } finally {
          describeGateStack.length -= runtimeGates.length
        }
      } as jest.ProvidesCallback)
    }

    const applicable = [...describeGateStack, ...runtimeGates]

    const staticInversion = findStaticInversion(applicable)
    const failingFn = (testFn as { failing?: TestFn }).failing
    if (staticInversion && typeof failingFn === 'function') {
      return failingFn(
        name,
        wrapFailingBody(staticInversion, callback),
        timeout
      )
    }

    return testFn(name, wrapGatedBody(applicable, callback), timeout)
  }
}

/**
 * A snapshot of the gates on the enclosing `describe`(s), taken while the
 * describe body is being collected. `nextTestSetup` reads this synchronously to
 * find a lazy `@force-gate` that should gate the fixture build. The stack is
 * empty again once collection finishes, so it must be read at call time.
 */
export function getActiveDescribeGates(): Gate[] {
  return [...describeGateStack]
}

/** Whether any of `gates` is a lazy `@force-gate` (resolved from config). */
export function hasLazyForceGate(gates: Gate[]): boolean {
  return gates.some((gate) => gate.force && gate.needsResolvedConfig)
}

/**
 * The first lazy `@force-gate` in `gates` whose condition is false against the
 * resolved `config` — i.e. the one that says "don't build this fixture here" —
 * or `null` if none apply. Used by `nextTestSetup` to skip the build.
 */
export function findLazyForceSkip(
  gates: Gate[],
  config: ResolvedNextConfig
): GatePragma | null {
  for (const gate of gates) {
    if (
      gate.force &&
      gate.needsResolvedConfig &&
      !evaluate(gate.node, (name) => readCondition(name, config))
    ) {
      return gate
    }
  }
  return null
}

/**
 * Every `it` / `test` — gated or not — has to consult the enclosing
 * `describe`'s gates, so the globals are wrapped once. This is the same
 * technique `test/lib/e2e-utils` uses to inject a per-test timeout, and the two
 * wrappers compose.
 *
 * Known gap: `it.each` and friends bypass the wrapper, so a `describe`-level
 * gate does not reach them. `it.each` cannot carry a pragma of its own either
 * (the transform rejects it).
 */
function wrapTestGlobals(): void {
  for (const key of ['it', 'test'] as const) {
    const original = (global as any)[key]
    if (typeof original !== 'function' || original.__gateWrapped) continue

    const wrapped = new Proxy(original, {
      apply(target, thisArg, args: any[]) {
        const [name, callback, timeout] = args
        if (
          describeGateStack.length === 0 ||
          typeof callback !== 'function' ||
          gatedBodies.has(callback)
        ) {
          return Reflect.apply(target, thisArg, args)
        }

        const applicable = [...describeGateStack]
        const staticInversion = findStaticInversion(applicable)
        const failingFn = (target as { failing?: TestFn }).failing
        if (staticInversion && typeof failingFn === 'function') {
          return Reflect.apply(failingFn, thisArg, [
            name,
            wrapFailingBody(staticInversion, callback),
            timeout,
          ])
        }

        return Reflect.apply(target, thisArg, [
          name,
          wrapGatedBody(applicable, callback),
          timeout,
        ])
      },
    })
    Object.defineProperty(wrapped, '__gateWrapped', { value: true })
    ;(global as any)[key] = wrapped
  }
}

/** Called from `test/jest-setup-after-env.ts`. */
export function installGate(): void {
  ;(global as any)._test_gate = _test_gate
  wrapTestGlobals()
}

/** Test-only: the parse/validate half, without registering anything. */
export const __testing = { parseGate, decideGates, wrapGatedBody }
