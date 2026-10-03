import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from './hot-reloader-types'
import type { AnyStream } from '../app-render/stream-ops'
import { streamToUint8Array } from '../stream-utils/node-web-streams-helper'

const errorsRscStreamsByHtmlRequestId = new Map<string, AnyStream>()
const cleanupTimersByHtmlRequestId = new Map<string, NodeJS.Timeout>()

/**
 * How long an unconsumed errors stream is retained for a client that connects
 * later. The window needs to comfortably cover legitimate HMR startups —
 * a large cold dev build, a throttled network, or a paused debugger can take
 * minutes before the client opens the socket — while still bounding how long
 * a stream whose client never connects (curl, disabled JavaScript, bots) is
 * retained: without any bound, the entry and the RSC payload buffered in it
 * stay alive for the lifetime of the dev server.
 */
const CLEANUP_AFTER_MS = 10 * 60_000

function clearCleanupTimer(htmlRequestId: string) {
  const timer = cleanupTimersByHtmlRequestId.get(htmlRequestId)
  if (timer) {
    clearTimeout(timer)
    cleanupTimersByHtmlRequestId.delete(htmlRequestId)
  }
}

export function sendSerializedErrorsToClient(
  errorsRscStream: AnyStream,
  sendToClient: (message: HmrMessageSentToBrowser) => void
) {
  streamToUint8Array(errorsRscStream).then(
    (serializedErrors) => {
      sendToClient({
        type: HMR_MESSAGE_SENT_TO_BROWSER.ERRORS_TO_SHOW_IN_BROWSER,
        serializedErrors,
      })
    },
    (err) => {
      console.error(new Error('Failed to serialize errors.', { cause: err }))
    }
  )
}

export function sendSerializedErrorsToClientForHtmlRequest(
  htmlRequestId: string,
  sendToClient: (message: HmrMessageSentToBrowser) => void
) {
  const errorsRscStream = errorsRscStreamsByHtmlRequestId.get(htmlRequestId)

  if (!errorsRscStream) {
    return
  }

  clearCleanupTimer(htmlRequestId)
  errorsRscStreamsByHtmlRequestId.delete(htmlRequestId)

  sendSerializedErrorsToClient(errorsRscStream, sendToClient)
}

export function setErrorsRscStreamForHtmlRequest(
  htmlRequestId: string,
  errorsRscStream: AnyStream
) {
  errorsRscStreamsByHtmlRequestId.set(htmlRequestId, errorsRscStream)

  // Clean up after a timeout, in case the client never connects, e.g. when
  // CURL'ing the page, or loading the page with JavaScript disabled etc.
  clearCleanupTimer(htmlRequestId)
  const timer = setTimeout(() => {
    cleanupTimersByHtmlRequestId.delete(htmlRequestId)
    errorsRscStreamsByHtmlRequestId.delete(htmlRequestId)
  }, CLEANUP_AFTER_MS)
  // The timer is only a backstop and must not keep the process alive.
  timer.unref?.()
  cleanupTimersByHtmlRequestId.set(htmlRequestId, timer)
}

export function deleteErrorsRscStreamForHtmlRequest(htmlRequestId: string) {
  clearCleanupTimer(htmlRequestId)
  errorsRscStreamsByHtmlRequestId.delete(htmlRequestId)
}
