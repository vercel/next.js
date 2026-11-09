import type { IncomingMessage, ServerResponse } from 'http'
import type { NextApiResponse } from '../../../shared/lib/utils'
import { checkIsOnDemandRevalidate } from '../.'
import type { __ApiPreviewProps } from '../.'
import type { BaseNextRequest, BaseNextResponse } from '../../base-http'
import type { PreviewData } from '../../../types'

import {
  clearPreviewData,
  COOKIE_NAME_PRERENDER_BYPASS,
  COOKIE_NAME_PRERENDER_DATA,
  SYMBOL_PREVIEW_DATA,
} from '../index'
import { RequestCookies } from '../../web/spec-extension/cookies'
import { HeadersAdapter } from '../../web/spec-extension/adapters/headers'

/**
 * Whether the header object of a Node.js request rules out both preview
 * cookies, without parsing its cookies.
 *
 * A cookie's name is a part of the `cookie` header exactly as it was sent, so
 * a header that does not contain a name does not hold that cookie. The header
 * is looked up the way `HeadersAdapter` does it: the first key that is
 * `cookie` in any casing. Anything else (a `Headers` instance, a value that is
 * not a string) is left to the cookie parser.
 */
function hasNoPreviewCookies(
  headers: (IncomingMessage | BaseNextRequest | Request)['headers']
): boolean {
  if (typeof headers.get === 'function') {
    return false
  }

  const nodeHeaders = headers as IncomingMessage['headers']
  let cookie: unknown
  for (const key of Object.keys(nodeHeaders)) {
    if (key.toLowerCase() === 'cookie') {
      cookie = nodeHeaders[key]
      break
    }
  }

  if (typeof cookie === 'undefined') {
    return true
  }

  return (
    typeof cookie === 'string' &&
    !cookie.includes(COOKIE_NAME_PRERENDER_BYPASS) &&
    !cookie.includes(COOKIE_NAME_PRERENDER_DATA)
  )
}

export function tryGetPreviewData(
  req: IncomingMessage | BaseNextRequest | Request,
  res: ServerResponse | BaseNextResponse,
  options: __ApiPreviewProps,
  multiZoneDraftMode: boolean
): PreviewData {
  // if an On-Demand revalidation is being done preview mode
  // is disabled
  if (
    options &&
    checkIsOnDemandRevalidate(req.headers, options).isOnDemandRevalidate
  ) {
    return false
  }

  // Read cached preview data if present
  // TODO: use request metadata instead of a symbol
  if (SYMBOL_PREVIEW_DATA in req) {
    return req[SYMBOL_PREVIEW_DATA] as any
  }

  // Case: neither cookie is set, known from the header alone. Most requests
  // end here, and creating the headers adapter and parsing every cookie to
  // find that out is the larger part of this function's cost.
  if (hasNoPreviewCookies(req.headers)) {
    return false
  }

  const headers = HeadersAdapter.from(req.headers)
  const cookies = new RequestCookies(headers)

  const previewModeId = cookies.get(COOKIE_NAME_PRERENDER_BYPASS)?.value
  const tokenPreviewData = cookies.get(COOKIE_NAME_PRERENDER_DATA)?.value
  const isValidPreviewModeId =
    previewModeId === options.previewModeId ||
    // In dev mode, the cookie can be the actual hash value preview id but the
    // preview props can still be `development-id`.
    (process.env.NODE_ENV !== 'production' &&
      options.previewModeId === 'development-id')

  // Case: preview mode cookie set but data cookie is not set
  if (previewModeId && !tokenPreviewData && isValidPreviewModeId) {
    // This is "Draft Mode" which doesn't use
    // previewData, so we return an empty object
    // for backwards compat with "Preview Mode".
    const data = {}
    Object.defineProperty(req, SYMBOL_PREVIEW_DATA, {
      value: data,
      enumerable: false,
    })
    return data
  }

  // Case: neither cookie is set.
  if (!previewModeId && !tokenPreviewData) {
    return false
  }

  // Case: one cookie is set, but not the other.
  if (!previewModeId || !tokenPreviewData) {
    if (!multiZoneDraftMode) {
      clearPreviewData(res as NextApiResponse)
    }
    return false
  }

  // Case: preview session is for an old build.
  if (previewModeId !== options.previewModeId) {
    if (!multiZoneDraftMode) {
      clearPreviewData(res as NextApiResponse)
    }
    return false
  }

  let encryptedPreviewData: {
    data: string
  }
  try {
    const { createVerifier } =
      require('next/dist/compiled/fast-jwt') as typeof import('next/dist/compiled/fast-jwt')
    const verify = createVerifier({
      key: options.previewModeSigningKey,
      algorithms: ['HS256'],
    })
    encryptedPreviewData = verify(
      tokenPreviewData
    ) as typeof encryptedPreviewData
  } catch {
    // TODO: warn
    clearPreviewData(res as NextApiResponse)
    return false
  }

  const { decryptWithSecret } =
    require('../../crypto-utils') as typeof import('../../crypto-utils')
  const decryptedPreviewData = decryptWithSecret(
    Buffer.from(options.previewModeEncryptionKey),
    encryptedPreviewData.data
  )

  try {
    // TODO: strict runtime type checking
    const data = JSON.parse(decryptedPreviewData)
    // Cache lookup
    Object.defineProperty(req, SYMBOL_PREVIEW_DATA, {
      value: data,
      enumerable: false,
    })
    return data
  } catch {
    return false
  }
}
