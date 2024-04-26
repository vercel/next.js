import { WebNextResponse } from './web'

describe('WebNextResponse onClose', () => {
  it('stream body', async () => {
    const cb = jest.fn()
    const ts = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk)
      },
    })

    const webNextResponse = new WebNextResponse(ts)
    webNextResponse.onClose(cb)
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
    expect(text).toBe('abcdef')
  })

  it('string body', async () => {
    const cb = jest.fn()
    const webNextResponse = new WebNextResponse().body('abcdef')
    webNextResponse.onClose(cb)
    webNextResponse.send()
    expect(cb).toHaveBeenCalledTimes(0)
    const response = await webNextResponse.toResponse()
    expect(cb).toHaveBeenCalledTimes(0)
    const text = await response.text()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(text).toBe('abcdef')
  })
})
