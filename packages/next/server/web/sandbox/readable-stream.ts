import { TransformStream } from 'next/dist/compiled/web-streams-polyfill'

export class ReadableStream<T> {
  constructor(opts: UnderlyingSource = {}) {
    let closed = false
    let pullPromise: any

    let transformController: TransformStreamDefaultController
    const { readable, writable } = new TransformStream(
      {
        start: (controller: TransformStreamDefaultController) => {
          transformController = controller
        },
      },
      undefined,
      {
        highWaterMark: 1,
      }
    )

    const writer = writable.getWriter()
    const encoder = new TextEncoder()
    const controller: ReadableStreamController<T> = {
      get desiredSize() {
        return transformController.desiredSize
      },
      close: () => {
        if (!closed) {
          closed = true
          writer.close()
        }
      },
      enqueue: (chunk: T) => {
        writer.write(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
        pull()
      },
      error: (reason: any) => {
        transformController.error(reason)
      },
    }

    const pull = () => {
      if (opts.pull) {
        if (!pullPromise) {
          pullPromise = Promise.resolve().then(() => {
            pullPromise = 0
            opts.pull!(controller)
          })
        }
      }
    }

    if (opts.start) {
      opts.start(controller)
    }

    if (opts.cancel) {
      readable.cancel = (reason: any) => {
        opts.cancel!(reason)
        return readable.cancel(reason)
      }
    }

    pull()

    return readable
  }
}
