import type { ServerResponse } from 'http'
import { Writable } from 'stream'

type ContentTypeOption = string | undefined

export type RenderResultMetadata = {
  pageData?: any
  revalidate?: any
  staticBailoutInfo?: any
  devOnlyCacheBusterQueryString?: string
  isNotFound?: boolean
  isRedirect?: boolean
}

export default class RenderResult {
  private _result: string | ReadableStream<Uint8Array> | null
  private _contentType: ContentTypeOption

  // Extra render result meta fields
  private _metadata: RenderResultMetadata

  constructor(
    response: string | ReadableStream<Uint8Array> | null,
    {
      contentType,
      ...metadata
    }: {
      contentType?: ContentTypeOption
    } & RenderResultMetadata = {}
  ) {
    this._result = response
    this._contentType = contentType
    this._metadata = metadata
  }

  metadata() {
    return this._metadata
  }

  isNull(): boolean {
    return this._result === null
  }

  contentType(): ContentTypeOption {
    return this._contentType
  }

  toUnchunkedString(): string {
    if (typeof this._result !== 'string') {
      throw new Error(
        'invariant: dynamic responses cannot be unchunked. This is a bug in Next.js'
      )
    }
    return this._result
  }

  pipe(res: ServerResponse | Writable): Promise<void> {
    if (this._result === null) {
      throw new Error('invariant: response is null. This is a bug in Next.js')
    }
    if (typeof this._result === 'string') {
      throw new Error(
        'invariant: static responses cannot be piped. This is a bug in Next.js'
      )
    }
    const response = this._result
    const flush =
      typeof (res as any).flush === 'function'
        ? () => (res as any).flush()
        : () => {}

    return (async () => {
      const reader = response.getReader()
      let fatalError = false

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            res.end()
            return
          }

          fatalError = true
          res.write(value)
          flush()
        }
      } catch (err) {
        if (fatalError) {
          res.destroy(err as any)
        }
        throw err
      }
    })()
  }

  isDynamic(): boolean {
    return typeof this._result !== 'string'
  }

  static fromStatic(value: string): RenderResult {
    return new RenderResult(value)
  }

  static empty = RenderResult.fromStatic('')
}
