import type { OutgoingHttpHeaders, ServerResponse } from 'node:http'
import type { Readable, Writable } from 'node:stream'
import type { Revalidate } from './../lib/revalidate'
import type { FetchMetrics } from './../base-http'
import type { IncomingMessage } from 'http'

export type ContentTypeOption = string | undefined

export type AppPageRenderResultMetadata = {
  flightData?: string
  revalidate?: Revalidate
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
  fetchTags?: string
  fetchMetrics?: FetchMetrics
}

export type PagesRenderResultMetadata = {
  pageData?: any
  revalidate?: Revalidate
  assetQueryString?: string
  isNotFound?: boolean
  isRedirect?: boolean
}

export type StaticRenderResultMetadata = {}

export type RenderResultMetadata = AppPageRenderResultMetadata &
  PagesRenderResultMetadata &
  StaticRenderResultMetadata

export type RenderResultResponse =
  | Readable[]
  | Readable
  | ReadableStream<Uint8Array>[]
  | ReadableStream<Uint8Array>
  | string
  | null

export type RenderResultOptions<
  Metadata extends RenderResultMetadata = RenderResultMetadata,
> = {
  contentType?: ContentTypeOption
  waitUntil?: Promise<unknown>
  metadata: Metadata
}

export interface RenderResultBase<
  Metadata extends RenderResultMetadata = RenderResultMetadata,
> {
  readonly contentType: ContentTypeOption
  readonly metadata: Readonly<Metadata>
  // new(response: RenderResultResponse): this;
  assignMetadata(metadata: Metadata): void
  readonly isNull: boolean
  readonly isDynamic: boolean
  toUnchunkedString(stream?: false): string
  toUnchunkedString(stream: true): Promise<string>
  toUnchunkedString(stream?: boolean): string | Promise<string>
  chain(stream: Readable | ReadableStream<Uint8Array>): void
  pipeTo(stream: Writable | WritableStream<Uint8Array>): Promise<void>
  pipeToNodeResponse(response: ServerResponse): Promise<void>
}

export default class RenderResult<
  Metadata extends RenderResultMetadata = RenderResultMetadata,
> implements RenderResultBase<Metadata>
{
  constructor(
    response: RenderResultResponse,
    option: RenderResultOptions<Metadata>
  )
  contentType: ContentTypeOption
  metadata: Readonly<Metadata>
  assignMetadata(metadata: RenderResultMetadata): void
  isNull: boolean
  isDynamic: boolean
  toUnchunkedString(stream?: false): string
  toUnchunkedString(stream: true): Promise<string>
  toUnchunkedString(stream?: boolean): string | Promise<string>
  chain(stream: Readable | ReadableStream<Uint8Array>): void
  pipeTo(stream: Writable | WritableStream<Uint8Array>): Promise<void>
  pipeToNodeResponse(response: ServerResponse<IncomingMessage>): Promise<void>
  static fromStatic(value: string): RenderResult
}
