import { isForbiddenError } from '../../../../../client/components/forbidden'
import { isNotFoundError } from '../../../../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
  getRedirectStatusCodeFromError,
} from '../../../../../client/components/redirect'
import {
  handleForbiddenResponse,
  handleNotFoundResponse,
  handleRedirectResponse,
} from '../../helpers/response-handlers'

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

  if (isNotFoundError(err)) {
    // This is a not found error! Send the not found response.
    return handleNotFoundResponse()
  }

  if (isForbiddenError(err)) {
    // This is a forbidden error! Send the forbidden response.
    return handleForbiddenResponse()
  }

  // Return false to indicate that this is not a handled error.
  return false
}
