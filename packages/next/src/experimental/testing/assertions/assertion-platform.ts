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
