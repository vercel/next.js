import type { IncomingMessage } from 'http'
import type { BaseNextRequest } from '../base-http'
import { ACTION } from '../../client/components/app-router-headers'

export function getServerActionRequestMetadata(
  req: IncomingMessage | BaseNextRequest
): {
  actionId: string | null
  isURLEncodedAction: boolean
  isMultipartAction: boolean
  isFetchAction: boolean
} {
  let actionId: string | null
  let contentType: string | null

  actionId = (req.headers[ACTION.toLowerCase()] as string) ?? null
  contentType = req.headers['content-type'] ?? null

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

  return { actionId, isURLEncodedAction, isMultipartAction, isFetchAction }
}

export function getIsServerAction(
  req: IncomingMessage | BaseNextRequest
): boolean {
  const { isFetchAction, isURLEncodedAction, isMultipartAction } =
    getServerActionRequestMetadata(req)

  return Boolean(isFetchAction || isURLEncodedAction || isMultipartAction)
}
