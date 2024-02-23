import isError from '../../lib/is-error'

export function isHydrationError(error: unknown): boolean {
  return isError(error) && error.message.match(/hydration failed/i) != null
}
