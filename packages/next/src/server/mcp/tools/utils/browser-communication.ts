/**
 * Shared utilities for MCP tools that communicate with the browser.
 * This module provides a common infrastructure for request-response
 * communication between MCP endpoints and browser sessions via HMR.
 */

import { nanoid } from 'next/dist/compiled/nanoid'
import type {
  HMR_MESSAGE_SENT_TO_BROWSER,
  HmrMessageSentToBrowser,
} from '../../../dev/hot-reloader-types'

export const DEFAULT_BROWSER_REQUEST_TIMEOUT_MS = 5000

export type BrowserResponse<T> = {
  url: string
  data: T
}

type PendingRequest<T> = {
  responses: BrowserResponse<T>[]
  expectedCount: number
  resolve: (value: BrowserResponse<T>[]) => void
  reject: (reason?: unknown) => void
  timeout: NodeJS.Timeout
}

const pendingRequests = new Map<string, PendingRequest<unknown>>()

export function createBrowserRequest<T>(
  messageType: HMR_MESSAGE_SENT_TO_BROWSER,
  sendHmrMessage: (message: HmrMessageSentToBrowser) => void,
  getActiveConnectionCount: () => number,
  timeoutMs: number
): Promise<BrowserResponse<T>[]> {
  const connectionCount = getActiveConnectionCount()
  if (connectionCount === 0) {
    return Promise.resolve([])
  }

  const requestId = `mcp-${messageType}-${nanoid()}`

  const responsePromise = new Promise<BrowserResponse<T>[]>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = pendingRequests.get(requestId)
        if (pending && pending.responses.length > 0) {
          resolve(pending.responses as BrowserResponse<T>[])
        } else {
          reject(
            new Error(
              `Timeout waiting for response from frontend. The browser may not be responding to HMR messages.`
            )
          )
        }
        pendingRequests.delete(requestId)
      }, timeoutMs)

      pendingRequests.set(requestId, {
        responses: [],
        expectedCount: connectionCount,
        resolve: resolve as (value: BrowserResponse<unknown>[]) => void,
        reject,
        timeout,
      })
    }
  )

  sendHmrMessage({
    type: messageType,
    requestId,
  } as HmrMessageSentToBrowser)

  return responsePromise
}

export function handleBrowserPageResponse<T>(
  requestId: string,
  data: T,
  url: string
): void {
  if (!url) {
    throw new Error(
      'URL is required in MCP browser response. This is a bug in Next.js.'
    )
  }

  const pending = pendingRequests.get(requestId)
  if (pending) {
    pending.responses.push({ url, data })
    if (pending.responses.length >= pending.expectedCount) {
      clearTimeout(pending.timeout)
      pending.resolve(pending.responses)
      pendingRequests.delete(requestId)
    }
  }
}
