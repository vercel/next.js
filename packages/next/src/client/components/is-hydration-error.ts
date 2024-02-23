import isError from '../../lib/is-error'

// Caused by incorrect rendering by misalignment between server and client
const serverClientMismatchErrorRegex = /content does not match|did not match/i
// This could caused by bad nesting of HTML, that client hydration failed
const hydrationErrorRegex = /hydration failed|while hydrating/i

export function isHydrationFailureError(error: unknown): boolean {
  return isError(error) && hydrationErrorRegex.test(error.message)
}

export function isHydrationMismatchError(error: unknown): boolean {
  return (
    isHydrationFailureError(error) ||
    (isError(error) && serverClientMismatchErrorRegex.test(error.message))
  )
}
