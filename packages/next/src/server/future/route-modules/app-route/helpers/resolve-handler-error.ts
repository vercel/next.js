import {
  getURLFromRedirectError,
  isRedirectError,
  getRedirectStatusCodeFromError,
} from '../../../../../client/components/redirect'
import { handleRedirectResponse } from '../../helpers/response-handlers'
import {
  uiErrorTypesWithStatusCodes,
  uiErrorTypesWithStatusCodesMap,
} from '../../helpers/respone-ui-errors'

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

  const uiError = uiErrorTypesWithStatusCodes.find((errorType) =>
    uiErrorTypesWithStatusCodesMap[errorType].matcher(err)
  )

  if (uiError) {
    return new Response(null, {
      status: uiErrorTypesWithStatusCodesMap[uiError].statusCode,
    })
  }

  // Return false to indicate that this is not a handled error.
  return false
}
