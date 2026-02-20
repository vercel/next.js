import type { NextInvariants } from '../../server/next-invariants'

export function setNextInvariantsForTest(
  overrides?: Partial<NextInvariants>
): void {
  ;(globalThis as any).__NEXT_INVARIANTS__ = Object.freeze({
    isDevServer: false,
    trailingSlash: false,
    experimentalOptimisticRouting: false,
    ...overrides,
  })
}
