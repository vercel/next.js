import { Crypto as WebCrypto } from 'next/dist/compiled/@peculiar/webcrypto'
import { TransformStream } from 'next/dist/compiled/web-streams-polyfill'
import { v4 as uuid } from 'next/dist/compiled/uuid'

export function atob(b64Encoded: string) {
  return Buffer.from(b64Encoded, 'base64').toString('binary')
}

export function btoa(str: string) {
  return Buffer.from(str, 'binary').toString('base64')
}

class TextEncoderRuntime {
  encoder: TextEncoder

  constructor() {
    this.encoder = new TextEncoder()
  }

  get encoding() {
    return this.encoder.encoding
  }

  public encode(input: string) {
    return this.encoder.encode(input)
  }
}

class TextDecoderRuntime {
  decoder: TextDecoder

  constructor() {
    this.decoder = new TextDecoder()
  }

  get encoding() {
    return this.decoder.encoding
  }

  get fatal() {
    return this.decoder.fatal
  }

  get ignoreBOM() {
    return this.decoder.ignoreBOM
  }

  public decode(input: BufferSource, options?: TextDecodeOptions) {
    return this.decoder.decode(input, options)
  }
}

export { TextDecoderRuntime as TextDecoder }
export { TextEncoderRuntime as TextEncoder }

export class Crypto extends WebCrypto {
  randomUUID() {
    return uuid()
  }
}

export class ReadableStream<T> {
  constructor(opts: UnderlyingSource = {}) {
    let closed = false
    let pullPromise: any

    let transformController: TransformStreamDefaultController
    const { readable, writable } = new TransformStream({
      start: (controller: TransformStreamDefaultController) => {
        transformController = controller
      },
    })

    const writer = writable.getWriter()
    const controller: ReadableStreamController<T> = {
      get desiredSize() {
        return writer.desiredSize
      },
      close: () => {
        if (!closed) {
          closed = true
          writer.close()
        }
      },
      enqueue: (chunk: T) => {
        console.log('enqueue ->', chunk)
        writer.write(chunk)
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
