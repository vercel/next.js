import type { IncomingMessage } from 'http'
import type { BaseNextRequest } from '../base-http'
import type { NextRequest } from '../web/exports'
import { ACTION_HEADER } from '../../client/components/app-router-headers'
import { InvariantError } from '../../shared/lib/invariant-error'

type OldMetadata = {
  actionId: string | null
  isURLEncodedAction: boolean
  isMultipartAction: boolean
  isFetchAction: boolean
  isServerAction: boolean
}

export function transformActionMetadata(
  meta: ServerActionMetadata | null
): OldMetadata {
  if (!meta) {
    return {
      actionId: null,
      isServerAction: false,
      isFetchAction: false,
      isURLEncodedAction: false,
      isMultipartAction: false,
    }
  }

  switch (meta.kind) {
    case 'no-js': {
      return {
        actionId: null,
        isServerAction: true,
        isFetchAction: false,
        isMultipartAction: meta.encoding === 'form',
        isURLEncodedAction: meta.encoding === 'url',
      }
    }
    case 'fetch': {
      return {
        actionId: meta.actionId,
        isServerAction: true,
        isFetchAction: true,
        isMultipartAction: meta.encoding === 'form',
        isURLEncodedAction: meta.encoding === 'url',
      }
    }
    default: {
      const _: never = meta
      throw new InvariantError('Invalid actionMetadata kind')
    }
  }
}

export type ServerActionMetadata =
  | {
      kind: 'fetch'
      actionId: string
      encoding: 'url' | 'form'
    }
  | {
      kind: 'no-js'
      actionId: null
      encoding: 'url' | 'form'
    }

export function getServerActionRequestMetadataNew(
  req: IncomingMessage | BaseNextRequest | NextRequest
): ServerActionMetadata | null {
  let actionId: string | null
  let contentType: string | null

  if (req.method !== 'POST') {
    return null
  }

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

  if (!isURLEncodedAction && !isMultipartAction) {
    return null
  }

  const encoding: 'url' | 'form' = isURLEncodedAction ? 'url' : 'form'

  if (actionId === null) {
    return {
      kind: 'no-js',
      actionId,
      encoding,
    }
  }

  return {
    kind: 'fetch',
    actionId,
    encoding,
  }
}

export function getIsServerAction(
  req: IncomingMessage | BaseNextRequest | NextRequest
): boolean {
  return transformActionMetadata(getServerActionRequestMetadataNew(req))
    .isServerAction
}
