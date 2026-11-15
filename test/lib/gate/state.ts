/**
 * The seam between the gate runtime and the Next.js fixture a suite booted.
 *
 * A fixture is registered by `createNext()` as soon as it is set up, and
 * unregistered when it is destroyed. Registering the *instance* rather than a
 * config snapshot is what keeps `skipStart: true` suites and `next.build()` /
 * restart flows working: nothing is resolved until a gate actually asks, by
 * which point the fixture is up.
 *
 * Suites with no lazy `@gate` therefore pay nothing at all.
 */

import type { ResolvedNextConfig } from './resolved-config'

/**
 * The part of `NextInstance` the gate runtime needs. Structural, so this module
 * stays independent of `test/lib/next-modes/base.ts`.
 */
export type GateConfigSource = {
  getResolvedConfig(): Promise<ResolvedNextConfig>
}

let activeFixture: GateConfigSource | null = null

export function registerFixture(fixture: GateConfigSource): void {
  activeFixture = fixture
}

export function clearFixture(): void {
  activeFixture = null
}

export function hasFixture(): boolean {
  return activeFixture !== null
}

/**
 * Resolves the running fixture's config for a lazy condition. Memoization lives
 * on the instance, so repeated gates in one file resolve it once.
 */
export function getResolvedConfigForGates(): Promise<ResolvedNextConfig> {
  if (!activeFixture) {
    throw new Error(
      `This \`@gate\` condition is resolved from the running Next.js ` +
        `fixture's config, but no fixture is registered. Is this suite using ` +
        `\`nextTestSetup()\`? Conditions that are known up front (\`dev\`, ` +
        `\`turbopack\`, ...) do not need one.`
    )
  }
  return activeFixture.getResolvedConfig()
}
