import {
  assertBrowserApiScope,
  assertInternalAttemptOwner,
  beginAssertionFile as beginClientAssertionFile,
  getFileAssertionOrigin as getClientAssertionOrigin,
} from './async-context'
export { createEnvironmentStubs } from './env'
export const fileAssertionLifetime: boolean = true
export const beginAssertionFile = beginClientAssertionFile
export const getFileAssertionOrigin = getClientAssertionOrigin
export function assertAssertionRuntimeAccess(): void {
  assertBrowserApiScope('assertion')
}
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
