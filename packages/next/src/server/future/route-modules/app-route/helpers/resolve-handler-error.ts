import { isNotFoundError } from '../../../../../client/components/not-found'
import {
  isRedirectError,
  parseRedirectError,
} from '../../../../../client/components/redirect'
import {
  handleNotFoundResponse,
  handleRedirectResponse,
} from '../../helpers/response-handlers'

export function resolveHandlerError(err: any): Response | false {
  if (isRedirectError(err)) {
    const { url, statusCode } = parseRedirectError(err)
    if (!url) {
      throw new Error('Invariant: Unexpected redirect url format')
    }

    // This is a redirect error! Send the redirect response.
    return handleRedirectResponse(url, err.mutableCookies, statusCode)
  }

  if (isNotFoundError(err)) {
    // This is a not found error! Send the not found response.
    return handleNotFoundResponse()
  }

  // Return false to indicate that this is not a handled error.
  return false
}
