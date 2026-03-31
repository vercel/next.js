import { streamToUint8Array } from '../stream-utils/node-web-streams-helper'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from './hot-reloader-types'

const errorsRscStreamsByHtmlRequestId = new Map<
  string,
  ReadableStream<Uint8Array>
>()

export function sendSerializedErrorsToClient(
  errorsRscStream: ReadableStream<Uint8Array>,
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

  errorsRscStreamsByHtmlRequestId.delete(htmlRequestId)

  sendSerializedErrorsToClient(errorsRscStream, sendToClient)
}

export function setErrorsRscStreamForHtmlRequest(
  htmlRequestId: string,
  errorsRscStream: ReadableStream<Uint8Array>
) {
  // TODO: Clean up after a timeout, in case the client never connects, e.g.
  // when CURL'ing the page, or loading the page with JavaScript disabled etc.
  errorsRscStreamsByHtmlRequestId.set(htmlRequestId, errorsRscStream)
}

export function deleteErrorsRscStreamForHtmlRequest(htmlRequestId: string) {
  errorsRscStreamsByHtmlRequestId.delete(htmlRequestId)
}
