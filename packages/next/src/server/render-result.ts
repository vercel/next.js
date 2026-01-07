import type { OutgoingHttpHeaders, ServerResponse } from 'http'
import type { CacheControl } from './lib/cache-control'
import type { FetchMetrics } from './base-http'

import {
  chainStreams,
  streamFromBuffer,
  streamFromString,
  streamToString,
} from './stream-utils/node-web-streams-helper'
import { isAbortError, pipeToNodeResponse } from './pipe-readable'
import type { RenderResumeDataCache } from './resume-data-cache/resume-data-cache'
import { InvariantError } from '../shared/lib/invariant-error'
import type {
  HTML_CONTENT_TYPE_HEADER,
  JSON_CONTENT_TYPE_HEADER,
  TEXT_PLAIN_CONTENT_TYPE_HEADER,
} from '../lib/constants'
import type { RSC_CONTENT_TYPE_HEADER } from '../client/components/app-router-headers'

type ContentTypeOption =
  | typeof RSC_CONTENT_TYPE_HEADER // For App Page RSC responses
  | typeof HTML_CONTENT_TYPE_HEADER // For App Page, Pages HTML responses
  | typeof JSON_CONTENT_TYPE_HEADER // For API routes, Next.js data requests
  | typeof TEXT_PLAIN_CONTENT_TYPE_HEADER // For simplified errors

export type AppPageRenderResultMetadata = {
  flightData?: Buffer
  cacheControl?: CacheControl
  staticBailoutInfo?: {
    stack?: string
    description?: string
  }

  /**
   * The postponed state if the render had postponed and needs to be resumed.
   */
  postponed?: string

  /**
   * The headers to set on the response that were added by the render.
   */
  headers?: OutgoingHttpHeaders
  statusCode?: number
  fetchTags?: string
  fetchMetrics?: FetchMetrics

  segmentData?: Map<string, Buffer>

  /**
   * In development, the resume data cache is warmed up before the render. This
   * is attached to the metadata so that it can be used during the render. When
   * prerendering, the filled resume data cache is also attached to the metadata
   * so that it can be used when prerendering matching fallback shells.
   */
  renderResumeDataCache?: RenderResumeDataCache
}

export type PagesRenderResultMetadata = {
  pageData?: any
  cacheControl?: CacheControl
  assetQueryString?: string
  isNotFound?: boolean
  isRedirect?: boolean
}

export type StaticRenderResultMetadata = {}

export type RenderResultMetadata = AppPageRenderResultMetadata &
  PagesRenderResultMetadata &
  StaticRenderResultMetadata

export type RenderResultResponse =
  | ReadableStream<Uint8Array>[]
  | ReadableStream<Uint8Array>
  | string
  | Buffer
  | null

export type RenderResultOptions<
  Metadata extends RenderResultMetadata = RenderResultMetadata,
> = {
  contentType: ContentTypeOption | null
  waitUntil?: Promise<unknown>
  metadata: Metadata
}

export default class RenderResult<
  Metadata extends RenderResultMetadata = RenderResultMetadata,
> {
  /**
   * The detected content type for the response. This is used to set the
   * `Content-Type` header.
   */
  public readonly contentType: ContentTypeOption | null

  /**
   * The metadata for the response. This is used to set the revalidation times
   * and other metadata.
   */
  public readonly metadata: Readonly<Metadata>

  /**
   * The response itself. This can be a string, a stream, or null. If it's a
   * string, then it's a static response. If it's a stream, then it's a
   * dynamic response. If it's null, then the response was not found or was
   * already sent.
   */
  private response: RenderResultResponse

  /**
   * A render result that represents an empty response. This is used to
   * represent a response that was not found or was already sent.
   */
  public static readonly EMPTY = new RenderResult<StaticRenderResultMetadata>(
    null,
    { metadata: {}, contentType: null }
  )

  /**
   * Creates a new RenderResult instance from a static response.
   *
   * @param value the static response value
   * @param contentType the content type of the response
   * @returns a new RenderResult instance
   */
  public static fromStatic(
    value: string | Buffer,
    contentType: ContentTypeOption
  ) {
    return new RenderResult<StaticRenderResultMetadata>(value, {
      metadata: {},
      contentType,
    })
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

  public assignMetadata(metadata: Metadata) {
    Object.assign(this.metadata, metadata)
  }

  /**
   * Returns true if the response is null. It can be null if the response was
   * not found or was already sent.
   */
  public get isNull(): boolean {
    return this.response === null
  }

  /**
   * Returns false if the response is a string. It can be a string if the page
   * was prerendered. If it's not, then it was generated dynamically.
   */
  public get isDynamic(): boolean {
    return typeof this.response !== 'string'
  }

  /**
   * Returns the response if it is a string. If the page was dynamic, this will
   * return a promise if the `stream` option is true, or it will throw an error.
   *
   * @param stream Whether or not to return a promise if the response is dynamic
   * @returns The response as a string
   */
  public toUnchunkedString(stream?: false): string
  public toUnchunkedString(stream: true): Promise<string>
  public toUnchunkedString(stream = false): Promise<string> | string {
    if (this.response === null) {
      // If the response is null, return an empty string. This behavior is
      // intentional as we're now providing the `RenderResult.EMPTY` value.
      return ''
    }

    if (typeof this.response !== 'string') {
      if (!stream) {
        throw new InvariantError(
          'dynamic responses cannot be unchunked. This is a bug in Next.js'
        )
      }

      return streamToString(this.readable)
    }

    return this.response
  }

  /**
   * Returns a readable stream of the response.
   */
  private get readable(): ReadableStream<Uint8Array> {
    if (this.response === null) {
      // If the response is null, return an empty stream. This behavior is
      // intentional as we're now providing the `RenderResult.EMPTY` value.
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close()
        },
      })
    }

    if (typeof this.response === 'string') {
      return streamFromString(this.response)
    }

    if (Buffer.isBuffer(this.response)) {
      return streamFromBuffer(this.response)
    }

    // If the response is an array of streams, then chain them together.
    if (Array.isArray(this.response)) {
      return chainStreams(...this.response)
    }

    return this.response
  }

  /**
   * Coerces the response to an array of streams. This will convert the response
   * to an array of streams if it is not already one.
   *
   * @returns An array of streams
   */
  private coerce(): ReadableStream<Uint8Array>[] {
    if (this.response === null) {
      // If the response is null, return an empty stream. This behavior is
      // intentional as we're now providing the `RenderResult.EMPTY` value.
      return []
    }

    if (typeof this.response === 'string') {
      return [streamFromString(this.response)]
    } else if (Array.isArray(this.response)) {
      return this.response
    } else if (Buffer.isBuffer(this.response)) {
      return [streamFromBuffer(this.response)]
    } else {
      return [this.response]
    }
  }

  /**
   * Unshifts a new stream to the response. This will convert the response to an
   * array of streams if it is not already one and will add the new stream to
   * the start of the array. When this response is piped, all of the streams
   * will be piped one after the other.
   *
   * @param readable The new stream to unshift
   */
  public unshift(readable: ReadableStream<Uint8Array>): void {
    // Coerce the response to an array of streams.
    this.response = this.coerce()

    // Add the new stream to the start of the array.
    this.response.unshift(readable)
  }

  /**
   * Chains a new stream to the response. This will convert the response to an
   * array of streams if it is not already one and will add the new stream to
   * the end. When this response is piped, all of the streams will be piped
   * one after the other.
   *
   * @param readable The new stream to chain
   */
  public push(readable: ReadableStream<Uint8Array>): void {
    // Coerce the response to an array of streams.
    this.response = this.coerce()

    // Add the new stream to the end of the array.
    this.response.push(readable)
  }

  /**
   * Pipes the response to a writable stream. This will close/cancel the
   * writable stream if an error is encountered. If this doesn't throw, then
   * the writable stream will be closed or aborted.
   *
   * @param writable Writable stream to pipe the response to
   */
  public async pipeTo(writable: WritableStream<Uint8Array>): Promise<void> {
    try {
      await this.readable.pipeTo(writable, {
        // We want to close the writable stream ourselves so that we can wait
        // for the waitUntil promise to resolve before closing it. If an error
        // is encountered, we'll abort the writable stream if we swallowed the
        // error.
        preventClose: true,
      })

      // If there is a waitUntil promise, wait for it to resolve before
      // closing the writable stream.
      if (this.waitUntil) await this.waitUntil

      // Close the writable stream.
      await writable.close()
    } catch (err) {
      // If this is an abort error, we should abort the writable stream (as we
      // took ownership of it when we started piping). We don't need to re-throw
      // because we handled the error.
      if (isAbortError(err)) {
        // Abort the writable stream if an error is encountered.
        await writable.abort(err)

        return
      }

      // We're not aborting the writer here as when this method throws it's not
      // clear as to how so the caller should assume it's their responsibility
      // to clean up the writer.
      throw err
    }
  }

  /**
   * Pipes the response to a node response. This will close/cancel the node
   * response if an error is encountered.
   *
   * @param res
   */
  public async pipeToNodeResponse(res: ServerResponse) {
    await pipeToNodeResponse(this.readable, res, this.waitUntil)
  }
}
