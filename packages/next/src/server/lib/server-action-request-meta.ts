import type { IncomingMessage } from 'http'
import type { BaseNextRequest } from '../base-http'
import type { NextRequest } from '../web/exports'
import { ACTION_HEADER } from '../../client/components/app-router-headers'

export type ServerActionRequestMetadata =
  | {
      isFetchAction: true
      actionId: string
      isURLEncodedAction: boolean
      isMultipartAction: boolean
      isPotentialServerAction: true
    }
  | {
      isFetchAction: false
      actionId: null
      isURLEncodedAction: boolean
      isMultipartAction: boolean
      isPotentialServerAction: boolean
    }

export function getServerActionRequestMetadata(
  req: IncomingMessage | BaseNextRequest | NextRequest
): ServerActionRequestMetadata {
  let actionId: string | null
  let contentType: string | null

  if (req.headers instanceof Headers) {
    actionId = req.headers.get(ACTION_HEADER.toLowerCase()) ?? null
    contentType = req.headers.get('content-type')
  } else {
    actionId = (req.headers[ACTION_HEADER.toLowerCase()] as string) ?? null
    contentType = req.headers['content-type'] ?? null
  }

  const isURLEncodedAction = Boolean(
    req.method === 'POST' && contentType === 'application/x-www-form-urlencoded'
  )
  const isMultipartAction = Boolean(
    req.method === 'POST' && contentType?.startsWith('multipart/form-data')
  )
  if (actionId !== null && req.method === 'POST') {
    return {
      isFetchAction: true,
      actionId,
      isMultipartAction,
      isURLEncodedAction,
      isPotentialServerAction: true,
    }
  }

  const isPotentialServerAction = Boolean(
    isURLEncodedAction || isMultipartAction
  )

  return {
    isFetchAction: false,
    // it may technically be non-null, but there's no use for it outside a fetch action.
    actionId: null,
    isURLEncodedAction,
    isMultipartAction,
    isPotentialServerAction,
  }
}

export function getIsPotentialServerAction(
  req: IncomingMessage | BaseNextRequest | NextRequest
): boolean {
  return getServerActionRequestMetadata(req).isPotentialServerAction
}
