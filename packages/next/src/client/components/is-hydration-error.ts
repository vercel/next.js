import isError from '../../lib/is-error'

export function isHydrationError(error: unknown): boolean {
  return (
    isError(error) &&
    error.message.match(/(hydration|content does not match|did not match)/i) !=
      null
  )
}
