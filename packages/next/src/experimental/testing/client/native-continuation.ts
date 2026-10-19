/**
 * This exact compiler-owned file retains native await. Its callbacks always
 * reenter the supplied origin; it never reads or infers a current test owner.
 */
export async function continueNative(
  value: unknown,
  scope: { run<T>(callback: () => T): T },
  fulfilled: (value: unknown) => void,
  rejected: (error: unknown) => void
): Promise<void> {
  let result: unknown
  try {
    result = await value
  } catch (error) {
    scope.run(() => rejected(error))
    return
  }
  scope.run(() => fulfilled(result))
}
