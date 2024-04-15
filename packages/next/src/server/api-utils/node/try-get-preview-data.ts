import type { IncomingMessage, ServerResponse } from 'http'
import type { NextApiResponse } from '../../../shared/lib/utils'
import { checkIsOnDemandRevalidate } from '../.'
import type { __ApiPreviewProps } from '../.'
import type { BaseNextRequest, BaseNextResponse } from '../../base-http'
import type { PreviewData } from 'next/types'

import {
  clearPreviewData,
  COOKIE_NAME_PRERENDER_BYPASS,
  COOKIE_NAME_PRERENDER_DATA,
  SYMBOL_PREVIEW_DATA,
} from '../index'
import { RequestCookies } from '../../web/spec-extension/cookies'
import { HeadersAdapter } from '../../web/spec-extension/adapters/headers'

export function tryGetPreviewData(
  req: IncomingMessage | BaseNextRequest | Request,
  res: ServerResponse | BaseNextResponse,
  options: __ApiPreviewProps
): PreviewData {
  // if an On-Demand revalidation is being done preview mode
  // is disabled
  if (options && checkIsOnDemandRevalidate(req, options).isOnDemandRevalidate) {
    return false
  }

  // Read cached preview data if present
  // TODO: use request metadata instead of a symbol
  if (SYMBOL_PREVIEW_DATA in req) {
    return (req as any)[SYMBOL_PREVIEW_DATA] as any
  }

  const headers = HeadersAdapter.from(req.headers)
  const cookies = new RequestCookies(headers)

  const previewModeId = cookies.get(COOKIE_NAME_PRERENDER_BYPASS)?.value
  const tokenPreviewData = cookies.get(COOKIE_NAME_PRERENDER_DATA)?.value

  // Case: preview mode cookie set but data cookie is not set
  if (
    previewModeId &&
    !tokenPreviewData &&
    previewModeId === options.previewModeId
  ) {
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
    clearPreviewData(res as NextApiResponse)
    return false
  }

  // Case: preview session is for an old build.
  if (previewModeId !== options.previewModeId) {
    clearPreviewData(res as NextApiResponse)
    return false
  }

  let encryptedPreviewData: {
    data: string
  }
  try {
    const jsonwebtoken =
      require('next/dist/compiled/jsonwebtoken') as typeof import('next/dist/compiled/jsonwebtoken')
    encryptedPreviewData = jsonwebtoken.verify(
      tokenPreviewData,
      options.previewModeSigningKey
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
