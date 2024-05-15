import type { Readable } from 'node:stream'
import type {
  RenderResultBase,
  ContentTypeOption,
  RenderResultMetadata,
  RenderResultOptions,
  StaticRenderResultMetadata,
} from '.'
import type { ServerResponse, IncomingMessage } from 'http'
import type { Writable } from 'stream'
import { chainStreams, streamFromString, streamToString } from '../stream-utils'
import { isAbortError, pipeToNodeResponse } from '../pipe-readable'

type RenderResultResponse = Readable[] | Readable | string | null

export default class RenderResult<
  Metadata extends RenderResultMetadata = RenderResultMetadata,
> implements RenderResultBase
{
  public readonly contentType: ContentTypeOption
  public readonly metadata: Readonly<Metadata>
  private response: RenderResultResponse

  public static fromStatic(value: string) {
    return new RenderResult<StaticRenderResultMetadata>(value, { metadata: {} })
  }

  private readonly waitUntil?: Promise<unknown>

  constructor(
    response: RenderResultResponse,
    { contentType, waitUntil, metadata }: RenderResultOptions<Metadata>
  ) {
    this.response = response
    this.contentType = contentType
    this.metadata = metadata
    this.waitUntil = waitUntil
  }

  public assignMetadata(metadata: Metadata): void {
    Object.assign(this.metadata, metadata)
  }
  public get isNull(): boolean {
    return this.response === null
  }
  public get isDynamic(): boolean {
    return typeof this.response !== 'string'
  }
  public toUnchunkedString(stream?: false): string
  public toUnchunkedString(stream: true): Promise<string>
  public toUnchunkedString(stream = false): string | Promise<string> {
    if (this.response === null) {
      throw new Error('Invariant: null responses canont be unchunked')
    }

    if (typeof this.response !== 'string') {
      if (!stream) {
        throw new Error(
          'Invariant: dynamic responses cannot be unchunked. This is a bug in Next.js'
        )
      }

      return streamToString(this.readable)
    }

    return this.response
  }

  private get readable(): Readable {
    if (this.response === null) {
      throw new Error('Invariant: null responses cannot be streamed')
    }
    if (typeof this.response === 'string') {
      throw new Error('Invariant: static responses cannot be streamed')
    }

    if (Array.isArray(this.response)) {
      return chainStreams(...this.response)
    }

    return this.response
  }

  public chain(stream: Readable): void {
    if (this.response === null) {
      throw new Error('Invariant: response is null. This is a bug in Next.js')
    }

    let responses: Readable[]
    if (typeof this.response === 'string') {
      responses = [streamFromString(this.response) as Readable]
    } else if (Array.isArray(this.response)) {
      responses = this.response
    } else {
      responses = [this.response]
    }

    responses.push(stream)

    this.response = responses
  }

  public async pipeTo(stream: Writable): Promise<void> {
    try {
      this.readable.pipe(stream, { end: false })
      if (this.waitUntil) await this.waitUntil
      stream.end()
    } catch (err) {
      if (isAbortError(err)) {
        stream.destroy(err)
        return
      }

      throw err
    }
  }

  public async pipeToNodeResponse(
    response: ServerResponse<IncomingMessage>
  ): Promise<void> {
    await pipeToNodeResponse(this.readable, response, this.waitUntil)
  }
}
