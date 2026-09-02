/**
 * The `@gate` condition registry.
 *
 * Every name that may appear inside a `// @gate` / `// @force-gate` pragma has
 * to be declared here. Referencing an undeclared name fails the whole test
 * suite at collection time, so a typo can never silently disable a gate.
 *
 * The registry is deliberately hand-written rather than derived from the
 * `next.config` schema: a gate is a claim about which *test-matrix dimension*
 * explains a failure, and that claim is worth spelling out. Keep the list small
 * and meaningful.
 *
 * ## The two tiers
 *
 * **`staticCondition`** — the value is known before any test runs (run mode,
 * bundler, React version). These are the only conditions `@force-gate` accepts,
 * because a real Jest skip has to be decided while tests are being collected.
 *
 * **`lazyCondition`** — a predicate over the *resolved* `next.config` of the
 * fixture the suite booted (`NextInstance.getResolvedConfig()`). The value is
 * read the first time a gate asks for it, which is inside the test body,
 * because nothing about the fixture exists at collection time.
 *
 * Read the resolved config, never `process.env`: `__NEXT_CACHE_COMPONENTS=true`
 * (set by the `--experimental` shard in `scripts/run-jest.sh`) is only applied
 * when the fixture has not set `cacheComponents` itself, and resolution implies
 * flags a fixture never mentions — `cacheComponents: true` alone turns on
 * `experimental.ppr` and `experimental.cachedNavigations`.
 *
 * ## Adding a condition
 *
 * 1. Pick a bare name that reads well after `@gate` and `!`.
 * 2. Add it below with a one-line description of what it means.
 * 3. For a lazy condition, read the key off the resolved config — remember that
 *    some keys moved out of `experimental` (`config.cacheComponents`) while
 *    others are still under it (`config.experimental.ppr`), and that some
 *    normalize to an object rather than a boolean
 *    (`experimental.prefetchInlining`). Returning the raw value is fine:
 *    expressions coerce by truthiness, and `===` comparisons see the raw value.
 *
 * Values do not have to be booleans. `mode` and `bundler` are strings so that
 * `// @gate mode === 'deploy'` works.
 */

import type { ResolvedNextConfig } from './resolved-config'
import { getGateTestContext } from './test-context'

export type ConditionValue = unknown

export type StaticCondition = {
  kind: 'static'
  description: string
  value: () => ConditionValue
}

export type LazyCondition = {
  kind: 'lazy'
  description: string
  value: (config: ResolvedNextConfig) => ConditionValue
}

export type Condition = StaticCondition | LazyCondition

function staticCondition(
  description: string,
  value: () => ConditionValue
): StaticCondition {
  return { kind: 'static', description, value }
}

function lazyCondition(
  description: string,
  value: (config: ResolvedNextConfig) => ConditionValue
): LazyCondition {
  return { kind: 'lazy', description, value }
}

export const conditions: Record<string, Condition> = {
  // --- static: the shape of this test run -----------------------------------

  mode: staticCondition(
    "the e2e run mode: 'dev' | 'start' | 'deploy'",
    () => getGateTestContext().mode
  ),
  dev: staticCondition(
    'running `next dev`',
    () => getGateTestContext().mode === 'dev'
  ),
  start: staticCondition(
    'running `next build` + `next start`',
    () => getGateTestContext().mode === 'start'
  ),
  deploy: staticCondition(
    'running against a real deployment',
    () => getGateTestContext().mode === 'deploy'
  ),

  // Semantic aliases for `!dev`. A gate is a claim about *why* a suite cannot
  // run, so prefer the name that states the reason over the bare mode check.
  prod: staticCondition(
    'the app was built with `next build` (`start` or `deploy`)',
    () => getGateTestContext().mode !== 'dev'
  ),
  prefetching: staticCondition(
    'links prefetch — disabled in dev, the usual reason a suite skips it',
    () => getGateTestContext().mode !== 'dev'
  ),

  bundler: staticCondition(
    "the bundler under test: 'turbopack' | 'rspack' | 'webpack'",
    () => getGateTestContext().bundler
  ),
  turbopack: staticCondition(
    'bundling with Turbopack',
    () => getGateTestContext().bundler === 'turbopack'
  ),
  rspack: staticCondition(
    'bundling with Rspack',
    () => getGateTestContext().bundler === 'rspack'
  ),
  webpack: staticCondition(
    'bundling with webpack',
    () => getGateTestContext().bundler === 'webpack'
  ),

  react18: staticCondition(
    'the fixture installs React 18 instead of the default React version',
    () => getGateTestContext().react18
  ),
  wasm: staticCondition(
    'using the wasm SWC binary (`NEXT_TEST_WASM`)',
    () => getGateTestContext().wasm
  ),
  ci: staticCondition('running in CI (`NEXT_TEST_CI`)', () =>
    Boolean(process.env.NEXT_TEST_CI)
  ),

  // Always false, so `// @gate FIXME` marks a test as a known failure without
  // inventing a condition for it. Mirrors the same convention in React's
  // scripts/jest/TestFlags.js. Prefer a real condition whenever one exists —
  // these two say "we know this is broken" and nothing about why.
  FIXME: staticCondition('known failure, no condition attached', () => false),
  TODO: staticCondition('known failure, no condition attached', () => false),

  // --- lazy: the fixture's resolved next.config ------------------------------

  cacheComponents: lazyCondition(
    'Cache Components are enabled for the fixture',
    (config) => config.cacheComponents
  ),
  ppr: lazyCondition(
    'partial prerendering is enabled (implied by `cacheComponents`)',
    (config) => config.experimental?.ppr
  ),
  cachedNavigations: lazyCondition(
    'client navigations are cached (implied by `cacheComponents`)',
    (config) => config.experimental?.cachedNavigations
  ),
  optimisticRouting: lazyCondition(
    'optimistic routing is enabled',
    (config) => config.experimental?.optimisticRouting
  ),
  concurrentRouterQueue: lazyCondition(
    'the concurrent router queue fork is enabled',
    (config) => config.experimental?.concurrentRouterQueue
  ),
  dynamicOnHover: lazyCondition(
    'dynamic prefetches are triggered on hover',
    (config) => config.experimental?.dynamicOnHover
  ),
  useOffline: lazyCondition(
    'the `useOffline()` hook is enabled for the fixture',
    (config) => config.experimental?.useOffline
  ),
  prefetchInlining: lazyCondition(
    'prefetches are inlined into the HTML payload; resolves to an object ' +
      '(`{maxSize, maxBundleSize}`) or `false`',
    (config) => config.experimental?.prefetchInlining
  ),
  output: lazyCondition(
    "`output` in the resolved config: 'standalone' | 'export' | undefined",
    (config) => config.output
  ),
  basePath: lazyCondition(
    'the fixture serves the app from a base path (a string, `` when unset)',
    (config) => config.basePath
  ),
  trailingSlash: lazyCondition(
    'URLs are normalized to a trailing slash',
    (config) => config.trailingSlash
  ),
}

export function isDeclared(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(conditions, name)
}

export function getCondition(name: string): Condition {
  if (!isDeclared(name)) {
    throw new Error(
      `\`@gate\` references an undeclared condition "${name}".\n\n` +
        `Declare it in test/lib/gate/conditions.ts, or fix the typo. ` +
        `Declared conditions: ${Object.keys(conditions).sort().join(', ')}.`
    )
  }
  return conditions[name]
}
