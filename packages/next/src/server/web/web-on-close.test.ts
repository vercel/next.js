import { DetachedPromise } from '../../lib/detached-promise'
import { trackStreamConsumed } from './web-on-close'

describe('trackStreamConsumed', () => {
  it('calls onEnd when the stream finishes', async () => {
    const endPromise = new DetachedPromise<void>()
    const onEnd = jest.fn(endPromise.resolve)

    const { stream: inputStream, controller } =
      readableStreamWithController<string>()
    const trackedStream = trackStreamConsumed(inputStream, onEnd)

    const reader = trackedStream.getReader()
    controller.enqueue('one')
    controller.enqueue('two')
    await reader.read()
    await reader.read()
    expect(onEnd).not.toHaveBeenCalled()

    controller.close()

    await endPromise.promise
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('calls onEnd when the stream errors', async () => {
    const endPromise = new DetachedPromise<void>()
    const onEnd = jest.fn(endPromise.resolve)

    const { stream: inputStream, controller } =
      readableStreamWithController<string>()
    const trackedStream = trackStreamConsumed(inputStream, onEnd)

    const reader = trackedStream.getReader()
    controller.enqueue('one')
    controller.enqueue('two')
    await reader.read()
    await reader.read()
    expect(onEnd).not.toHaveBeenCalled()

    controller.error(new Error('kaboom'))

    await endPromise.promise
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('calls onEnd when the stream is cancelled', async () => {
    const endPromise = new DetachedPromise<void>()
    const onEnd = jest.fn(endPromise.resolve)

    const { stream: inputStream, controller } =
      readableStreamWithController<string>()
    const trackedStream = trackStreamConsumed(inputStream, onEnd)

    const reader = trackedStream.getReader()
    controller.enqueue('one')
    controller.enqueue('two')
    await reader.read()
    await reader.read()
    expect(onEnd).not.toHaveBeenCalled()

    await reader.cancel()
    await endPromise.promise
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})

function readableStreamWithController<TChunk>() {
  let controller: ReadableStreamDefaultController<TChunk> = undefined!
  const stream = new ReadableStream<TChunk>({
    start(_controller) {
      controller = _controller
    },
  })
  return { controller, stream }
}
