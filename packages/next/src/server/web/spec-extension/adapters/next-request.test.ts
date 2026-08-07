import { once } from 'node:events'
import { PassThrough } from 'node:stream'

import {
  ResponseAborted,
  signalFromNodeResponse,
  signalFromNodeUpgradeSocket,
} from './next-request'

async function finishAndClose(stream: PassThrough): Promise<void> {
  const finished = once(stream, 'finish')
  stream.end()
  await finished
  expect(stream.writableFinished).toBe(true)

  const closed = once(stream, 'close')
  stream.destroy()
  await closed
}

describe('Node request abort signals', () => {
  it('does not treat a completed response close as an abort', async () => {
    const response = new PassThrough()
    const signal = signalFromNodeResponse(response)

    await finishAndClose(response)

    expect(signal.aborted).toBe(false)
  })

  it('treats a raw upgrade socket close as a disconnect after its writable side finishes', async () => {
    const socket = new PassThrough()
    const signal = signalFromNodeUpgradeSocket(socket)

    await finishAndClose(socket)

    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBeInstanceOf(ResponseAborted)
  })

  it('aborts when the peer ends the readable side before the socket closes', async () => {
    const socket = new PassThrough({ allowHalfOpen: true })
    socket.resume()
    const signal = signalFromNodeUpgradeSocket(socket)
    const ended = once(socket, 'end')

    socket.push(null)
    await ended

    expect(socket.destroyed).toBe(false)
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBeInstanceOf(ResponseAborted)
    socket.destroy()
  })

  it('returns an aborted signal for an already closed upgrade socket', async () => {
    const socket = new PassThrough()
    const closed = once(socket, 'close')
    socket.destroy()
    await closed

    const signal = signalFromNodeUpgradeSocket(socket)

    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBeInstanceOf(ResponseAborted)
  })
})
