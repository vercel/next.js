/**
 * This helper is used for testing code that should throw, without swallowing the error.
 *
 * It calls `callback` and checks if it throws.
 * If it did, we rethrow the error.
 * If it didn't throw, we throw a AssertionError/ClientAssertionError.
 * */
export function ensureThrows(callback: () => any, message?: string): never {
  let thrown: { value: unknown } | null = null
  try {
    callback()
  } catch (err) {
    thrown = { value: err }
  }

  if (thrown) {
    // The callback threw, as expected.
    throw thrown.value
  } else {
    // The callback didn't throw like it should have.
    message ??= 'Expected callback to throw'
    if (typeof window === 'undefined') {
      const { fail } =
        require('node:assert/strict') as typeof import('node:assert/strict')
      fail(message)
    } else {
      throw new Error('This code should never run in the browser')
    }
  }

  // For some reason, typescript doesn't believe that all codepaths above throw
  throw new Error('Unreachable')
}

/**
 * This helper is used for testing code that should throw, without swallowing the error.
 *
 * iT calls `callback` and checks if it rejected.
 * If it did, we rethrow the error.
 * If it didn't throw, we throw a AssertionError/ClientAssertionError.
 * */
export async function ensureRejects(
  callback: () => Promise<any>,
  message?: string
): Promise<never> {
  let thrown: { value: unknown } | null = null
  try {
    await callback()
  } catch (err) {
    thrown = { value: err }
  }

  if (thrown) {
    // The callback rejected, as expected.
    throw thrown.value
  } else {
    // The callback didn't reject like it should have.
    message ??= 'Expected callback to reject'
    if (typeof window === 'undefined') {
      const { fail } =
        require('node:assert/strict') as typeof import('node:assert/strict')
      fail(message)
    } else {
      throw new Error('This code should never run in the browser')
    }
  }

  // For some reason, typescript doesn't believe that all codepaths above throw
  throw new Error('Unreachable')
}
