class ReadableStream<T> {
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
        const shouldPull =
          controller.desiredSize !== null && controller.desiredSize > 0
        if (!pullPromise && shouldPull) {
          pullPromise = Promise.resolve().then(() => {
            pullPromise = 0
            opts.pull!(controller)
          })
          return pullPromise
        }
      }
      return Promise.resolve()
    }

    if (opts.cancel) {
      readable.cancel = (reason: any) => {
        opts.cancel!(reason)
        return readable.cancel(reason)
      }
    }

    function startPull() {
      const getReader = readable.getReader.bind(readable)
      readable.getReader = () => {
        pull()
        return getReader()
      }
    }

    const started = opts.start && opts.start(controller)
    if (typeof started.then === 'function') {
      started.then(() => startPull())
    } else {
      startPull()
    }

    return readable
  }
}

export { ReadableStream }
