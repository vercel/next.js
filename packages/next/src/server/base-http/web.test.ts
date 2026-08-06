import { WebNextResponse } from './web'

describe('WebNextResponse onClose', () => {
  it('stream body', async () => {
    const cb = jest.fn()
    const onResponseEnd = jest.fn()
    const ts = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk)
      },
    })

    const webNextResponse = new WebNextResponse(ts)
    webNextResponse.statusCode = 202
    webNextResponse.onClose(cb)
    webNextResponse.onResponseEnd(onResponseEnd)
    webNextResponse.send()
    expect(cb).toHaveBeenCalledTimes(0)
    const response = await webNextResponse.toResponse()
    expect(cb).toHaveBeenCalledTimes(0)
    const t = response.text()

    const encoder = new TextEncoder()
    const writer = ts.writable.getWriter()
    await writer.write(encoder.encode('abc'))
    await writer.write(encoder.encode('def'))
    await writer.close()

    const text = await t
    expect(cb).toHaveBeenCalledTimes(1)
    expect(onResponseEnd).toHaveBeenCalledWith({
      outcome: 'finished',
      statusCode: 202,
    })
    expect(text).toBe('abcdef')
  })

  it('string body', async () => {
    const cb = jest.fn()
    const onResponseEnd = jest.fn()
    const webNextResponse = new WebNextResponse(undefined).body('abcdef')
    webNextResponse.onClose(cb)
    webNextResponse.onResponseEnd(onResponseEnd)
    webNextResponse.send()
    expect(cb).toHaveBeenCalledTimes(0)
    const response = await webNextResponse.toResponse()
    expect(cb).toHaveBeenCalledTimes(0)
    const text = await response.text()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(onResponseEnd).toHaveBeenCalledWith({
      outcome: 'finished',
      statusCode: 200,
    })
    expect(text).toBe('abcdef')
  })

  it('distinguishes cancellation from a source stream error', async () => {
    const cancelled = new WebNextResponse()
    const onCancelled = jest.fn()
    cancelled.onResponseEnd(onCancelled)
    cancelled.send()
    const cancelledResponse = await cancelled.toResponse()
    const cancelledReader = cancelledResponse.body!.getReader()
    const cancellationReason = new Error('consumer cancelled')
    await cancelledReader.cancel(cancellationReason)

    expect(onCancelled).toHaveBeenCalledWith({
      outcome: 'aborted',
      error: cancellationReason,
      statusCode: 200,
    })

    const erroredStream = new TransformStream()
    const errored = new WebNextResponse(erroredStream)
    const onErrored = jest.fn()
    errored.onResponseEnd(onErrored)
    errored.send()
    const erroredResponse = await errored.toResponse()
    const streamError = new Error('source failed')
    await erroredStream.writable.abort(streamError)

    await expect(erroredResponse.text()).rejects.toThrow(streamError)
    expect(onErrored).toHaveBeenCalledWith({
      outcome: 'errored',
      error: streamError,
      statusCode: 200,
    })
  })
})
