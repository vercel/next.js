import {
  deleteErrorsRscStreamForHtmlRequest,
  sendSerializedErrorsToClientForHtmlRequest,
  setErrorsRscStreamForHtmlRequest,
} from './serialized-errors'
import type { AnyStream } from '../app-render/stream-ops'

jest.useFakeTimers()

function makeStream(): AnyStream {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('errors-payload'))
      controller.close()
    },
  }) as unknown as AnyStream
}

describe('serialized-errors', () => {
  it('sends a stored errors stream when the client connects', async () => {
    const sendToClient = jest.fn()
    setErrorsRscStreamForHtmlRequest('req-consume', makeStream())

    sendSerializedErrorsToClientForHtmlRequest('req-consume', sendToClient)
    await jest.advanceTimersByTimeAsync(0)

    expect(sendToClient).toHaveBeenCalledTimes(1)
    expect(sendToClient.mock.calls[0][0].serializedErrors).toBeDefined()
  })

  it('cleans up an errors stream the client never consumes', async () => {
    const sendToClient = jest.fn()
    setErrorsRscStreamForHtmlRequest('req-abandoned', makeStream())

    // The client never connects. After the cleanup window the entry is gone.
    await jest.advanceTimersByTimeAsync(10 * 60_000 + 1_000)

    sendSerializedErrorsToClientForHtmlRequest('req-abandoned', sendToClient)
    await jest.advanceTimersByTimeAsync(0)
    expect(sendToClient).not.toHaveBeenCalled()
  })

  it('deleteErrorsRscStreamForHtmlRequest drops the entry and its cleanup', async () => {
    const sendToClient = jest.fn()
    setErrorsRscStreamForHtmlRequest('req-deleted', makeStream())
    deleteErrorsRscStreamForHtmlRequest('req-deleted')

    await jest.advanceTimersByTimeAsync(10 * 60_000 + 1_000)

    sendSerializedErrorsToClientForHtmlRequest('req-deleted', sendToClient)
    await jest.advanceTimersByTimeAsync(0)
    expect(sendToClient).not.toHaveBeenCalled()
  })

  it('consuming before the timeout keeps the entry', async () => {
    const sendToClient = jest.fn()
    setErrorsRscStreamForHtmlRequest('req-early', makeStream())

    await jest.advanceTimersByTimeAsync(30_000)
    sendSerializedErrorsToClientForHtmlRequest('req-early', sendToClient)
    await jest.advanceTimersByTimeAsync(0)

    expect(sendToClient).toHaveBeenCalledTimes(1)
  })
})
