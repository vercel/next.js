import { assertScopeActive } from '../runner/async-context'
import type { EnvironmentStubs } from './utilities'

export function createEnvironmentStubs(): EnvironmentStubs | undefined {
  return undefined
}

export const fileAssertionLifetime: boolean = false
export function beginAssertionFile(): () => void {
  return () => {}
}
export function getFileAssertionOrigin(): { id: string } | undefined {
  return undefined
}
export function assertAssertionRuntimeAccess(): void {
  assertScopeActive()
}

/** Node already propagates public assertion scope through AsyncLocalStorage. */
export function assertAssertionScope(): void {}

/** Infrastructure checks preserve the same Node origin requirement. */
export function assertAssertionLifecycleScope(
  expectedId: string,
  originatingId: string | undefined,
  liveOwner: boolean
): void {
  if (!liveOwner || originatingId !== expectedId)
    throw new Error('expect() requires its active Next assertion scope')
}
