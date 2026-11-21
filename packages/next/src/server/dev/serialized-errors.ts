import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from './hot-reloader-types'
import type { AnyStream } from '../app-render/stream-ops'
import { streamToUint8Array } from '../stream-utils/node-web-streams-helper'
import { ParkedEntries, releaseParkedStream } from './parked-entries'

// Errors of HTML requests whose HMR client hasn't connected yet. A stream that
// isn't claimed in time is released.
const errorsRscStreamsByHtmlRequestId = new ParkedEntries<AnyStream>(
  releaseParkedStream
)

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
  const errorsRscStream = errorsRscStreamsByHtmlRequestId.take(htmlRequestId)

  if (!errorsRscStream) {
    return
  }

  sendSerializedErrorsToClient(errorsRscStream, sendToClient)
}

export function setErrorsRscStreamForHtmlRequest(
  htmlRequestId: string,
  errorsRscStream: AnyStream
) {
  errorsRscStreamsByHtmlRequestId.set(htmlRequestId, errorsRscStream)
}

export function deleteErrorsRscStreamForHtmlRequest(htmlRequestId: string) {
  errorsRscStreamsByHtmlRequestId.delete(htmlRequestId)
}
