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

    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    })

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

    const error = new Error('kaboom')
    controller.error(error)

    // if the underlying stream errors, we should error as well
    await expect(reader.read()).rejects.toThrow(error)

    await endPromise.promise
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('calls onEnd when the stream is cancelled', async () => {
    const endPromise = new DetachedPromise<void>()
    const onEnd = jest.fn(endPromise.resolve)

    const cancelledPromise = new DetachedPromise<unknown>()
    const onCancel = jest.fn(cancelledPromise.resolve)

    const { stream: inputStream, controller } =
      readableStreamWithController<string>(onCancel)
    const trackedStream = trackStreamConsumed(inputStream, onEnd)

    const reader = trackedStream.getReader()
    controller.enqueue('one')
    controller.enqueue('two')
    await reader.read()
    await reader.read()
    expect(onEnd).not.toHaveBeenCalled()

    const cancellationReason = new Error('cancelled')
    await reader.cancel(cancellationReason)

    // from a reader's perspective, a cancelled stream behaves like it's done
    // (which is a bit weird honestly?)
    await expect(reader.read()).resolves.toEqual({
      done: true,
      value: undefined,
    })

    await endPromise.promise
    expect(onEnd).toHaveBeenCalledTimes(1)

    //  the cancellation should propagate to back to the underlying stream
    await cancelledPromise.promise
    expect(onCancel).toHaveBeenCalledWith(cancellationReason)
  })
})

function readableStreamWithController<TChunk>(
  onCancel?: (reason: unknown) => void
) {
  let controller: ReadableStreamDefaultController<TChunk> = undefined!
  const stream = new ReadableStream<TChunk>({
    start(_controller) {
      controller = _controller
    },
    cancel(reason) {
      onCancel?.(reason)
    },
  })
  return { controller, stream }
}
