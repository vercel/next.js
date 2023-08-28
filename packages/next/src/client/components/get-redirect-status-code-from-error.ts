import { type RedirectError, isRedirectError } from './redirect'

export function getRedirectStatusCodeFromError<U extends string>(
  error: RedirectError<U>
): number {
  if (!isRedirectError(error)) {
    throw new Error('Not a redirect error')
  }

  return error.digest.split(';', 4)[3] === 'true' ? 308 : 307
}
