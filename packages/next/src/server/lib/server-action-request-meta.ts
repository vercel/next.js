import type { IncomingMessage } from 'http'
import type { BaseNextRequest } from '../base-http'
import type { NextRequest } from '../web/exports'
import { ACTION_HEADER } from '../../client/components/app-router-headers'

export function getServerActionRequestMetadata(
  req: IncomingMessage | BaseNextRequest | NextRequest
): {
  actionId: string | null
  isURLEncodedAction: boolean
  isMultipartAction: boolean
  isFetchAction: boolean
  isPossibleServerAction: boolean
} {
  let actionId: string | null
  let contentType: string | null

  if (req.headers instanceof Headers) {
    actionId = req.headers.get(ACTION_HEADER) ?? null
    contentType = req.headers.get('content-type')
  } else {
    actionId = (req.headers[ACTION_HEADER] as string) ?? null
    contentType = req.headers['content-type'] ?? null
  }

  const isURLEncodedAction = Boolean(
    req.method === 'POST' && contentType === 'application/x-www-form-urlencoded'
  )
  const isMultipartAction = Boolean(
    req.method === 'POST' && contentType?.startsWith('multipart/form-data')
  )
  const isFetchAction = Boolean(
    actionId !== undefined &&
      typeof actionId === 'string' &&
      req.method === 'POST'
  )

  const isPossibleServerAction = Boolean(
    isFetchAction || isURLEncodedAction || isMultipartAction
  )

  return {
    actionId,
    isURLEncodedAction,
    isMultipartAction,
    isFetchAction,
    isPossibleServerAction,
  }
}

export function getIsPossibleServerAction(
  req: IncomingMessage | BaseNextRequest | NextRequest
): boolean {
  return getServerActionRequestMetadata(req).isPossibleServerAction
}
