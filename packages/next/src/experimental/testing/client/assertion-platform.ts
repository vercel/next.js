import {
  assertBrowserApiScope,
  assertInternalAttemptOwner,
} from './async-context'
export function assertAssertionScope(): void {
  assertBrowserApiScope('assertion')
}
/** This verifies infrastructure ownership without activating a public origin. */
export function assertAssertionLifecycleScope(
  expectedId: string,
  originatingId: string | undefined,
  liveOwner: boolean
): void {
  if (
    !liveOwner ||
    (originatingId !== undefined && originatingId !== expectedId)
  )
    throw new Error('Mismatched Browser Mode assertion lifecycle owner.')
  assertInternalAttemptOwner(expectedId)
}
