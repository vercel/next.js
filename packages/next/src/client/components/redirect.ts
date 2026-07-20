import { RedirectStatusCode } from './redirect-status-code'
import {
  type RedirectType,
  type RedirectError,
  isRedirectError,
  REDIRECT_ERROR_CODE,
} from './redirect-error'
import { actionAsyncStorage } from './server-async-storage'

export function getRedirectError(
  url: string,
  type: RedirectType,
  statusCode: RedirectStatusCode = RedirectStatusCode.TemporaryRedirect
): RedirectError {
  const error = new Error(REDIRECT_ERROR_CODE) as RedirectError
  error.digest = `${REDIRECT_ERROR_CODE};${type};${url};${statusCode};`
  return error
}

/**
 * This function allows you to redirect the user to another URL. It can be used in
 * [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components),
 * [Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), and
 * [Server Functions](https://nextjs.org/docs/app/getting-started/mutating-data).
 *
 * - When used in a streaming context, this will insert a meta tag to emit the redirect on the client side.
 * - When used in a Server Action, it will serve a 303 HTTP redirect response to the caller.
 * - Otherwise, it will serve a 307 HTTP redirect response to the caller.
 * - In a Server Action, type defaults to 'push' and 'replace' elsewhere.
 *
 * Read more: [Next.js Docs: `redirect`](https://nextjs.org/docs/app/api-reference/functions/redirect)
 */
export function redirect(
  /** The URL to redirect to */
  url: string,
  type?: RedirectType
): never {
  type ??= actionAsyncStorage?.getStore()?.isAction ? 'push' : 'replace'

  throw getRedirectError(url, type, RedirectStatusCode.TemporaryRedirect)
}

/**
 * This function allows you to redirect the user to another URL. It can be used in
 * [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components),
 * [Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), and
 * [Server Functions](https://nextjs.org/docs/app/getting-started/mutating-data).
 *
 * - When used in a streaming context, this will insert a meta tag to emit the redirect on the client side.
 * - When used in a Server Action, it will serve a 303 HTTP redirect response to the caller.
 * - Otherwise, it will serve a 308 (Permanent) HTTP redirect response to the caller.
 *
 * Read more: [Next.js Docs: `permanentRedirect`](https://nextjs.org/docs/app/api-reference/functions/permanentRedirect)
 */
export function permanentRedirect(
  /** The URL to redirect to */
  url: string,
  type: RedirectType = 'replace'
): never {
  throw getRedirectError(url, type, RedirectStatusCode.PermanentRedirect)
}

/**
 * Returns the encoded URL from the error if it's a RedirectError, null
 * otherwise. Note that this does not validate the URL returned.
 *
 * @param error the error that may be a redirect error
 * @return the url if the error was a redirect error
 */
export function getURLFromRedirectError(error: RedirectError): string
export function getURLFromRedirectError(error: unknown): string | null {
  if (!isRedirectError(error)) return null

  // Slices off the beginning of the digest that contains the code and the
  // separating ';'.
  return error.digest.split(';').slice(2, -2).join(';')
}

export function getRedirectTypeFromError(error: RedirectError): RedirectType {
  if (!isRedirectError(error)) {
    throw new Error('Not a redirect error')
  }

  return error.digest.split(';', 2)[1] as RedirectType
}

export function getRedirectStatusCodeFromError(error: RedirectError): number {
  if (!isRedirectError(error)) {
    throw new Error('Not a redirect error')
  }

  return Number(error.digest.split(';').at(-2))
}
