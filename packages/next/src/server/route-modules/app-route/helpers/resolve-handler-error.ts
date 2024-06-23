import {
  getURLFromRedirectError,
  isRedirectError,
  getRedirectStatusCodeFromError,
} from '../../../../client/components/redirect'
import { handleRedirectResponse } from '../../helpers/response-handlers'
import {
  getUIErrorStatusCode,
  matchUIError,
} from '../../../../shared/lib/ui-error-types'

export function resolveHandlerError(err: any): Response | false {
  if (isRedirectError(err)) {
    const redirect = getURLFromRedirectError(err)
    if (!redirect) {
      throw new Error('Invariant: Unexpected redirect url format')
    }

    const status = getRedirectStatusCodeFromError(err)

    // This is a redirect error! Send the redirect response.
    return handleRedirectResponse(redirect, err.mutableCookies, status)
  }

  const uiError = matchUIError(err)

  if (uiError) {
    return new Response(null, {
      status: getUIErrorStatusCode(uiError),
    })
  }

  // Return false to indicate that this is not a handled error.
  return false
}
