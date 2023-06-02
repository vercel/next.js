import { isNotFoundError } from '../../../../../client/components/not-found'
import {
  getURLFromRedirectError,
  isRedirectError,
} from '../../../../../client/components/redirect'
import {
  handleNotFoundResponse,
  handleTemporaryRedirectResponse,
} from '../../helpers/response-handlers'

export function resolveHandlerError(err: any): Response | false {
  if (isRedirectError(err)) {
    const redirect = getURLFromRedirectError(err)
    if (!redirect) {
      throw new Error('Invariant: Unexpected redirect url format')
    }

    // This is a redirect error! Send the redirect response.
    return handleTemporaryRedirectResponse(redirect, err.mutableCookies)
  }

  if (isNotFoundError(err)) {
    // This is a not found error! Send the not found response.
    return handleNotFoundResponse()
  }

  // Return false to indicate that this is not a handled error.
  return false
}
