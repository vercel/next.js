import { StaticGenerationStore } from '../client/components/static-generation-async-storage.external'
import { pipeReadable, PipeTarget } from './pipe-readable'

type ContentTypeOption = string | undefined

export type RenderResultMetadata = {
  pageData?: any
  revalidate?: any
  staticBailoutInfo?: any
  assetQueryString?: string
  isNotFound?: boolean
  isRedirect?: boolean
  fetchMetrics?: StaticGenerationStore['fetchMetrics']
  fetchTags?: string
}

type RenderResultResponse = ReadableStream<Uint8Array> | string | null

export default class RenderResult {
  /**
   * The detected content type for the response. This is used to set the
   * `Content-Type` header.
   */
  public readonly contentType: ContentTypeOption

  /**
   * The metadata for the response. This is used to set the revalidation times
   * and other metadata.
   */
  public readonly metadata: RenderResultMetadata

  /**
   * The response itself. This can be a string, a stream, or null. If it's a
   * string, then it's a static response. If it's a stream, then it's a
   * dynamic response. If it's null, then the response was not found or was
   * already sent.
   */
  private readonly response: RenderResultResponse

  /**
   * Creates a new RenderResult instance from a static response.
   *
   * @param value the static response value
   * @returns a new RenderResult instance
   */
  public static fromStatic(value: string): RenderResult {
    return new RenderResult(value)
  }

  constructor(
    response: RenderResultResponse,
    {
      contentType,
      ...metadata
    }: {
      contentType?: ContentTypeOption
    } & RenderResultMetadata = {}
  ) {
    this.response = response
    this.contentType = contentType
    this.metadata = metadata
  }

  public extendMetadata(metadata: RenderResultMetadata) {
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
   * Returns true if the response is a stream. If the page was dynamic, this
   * will throw an error.
   *
   * @returns The response as a string
   */
  public toUnchunkedString(): string {
    if (typeof this.response !== 'string') {
      throw new Error(
        'Invariant: dynamic responses cannot be unchunked. This is a bug in Next.js'
      )
    }

    return this.response
  }

  public async pipe(res: PipeTarget<Uint8Array>): Promise<void> {
    if (this.response === null) {
      throw new Error('Invariant: response is null. This is a bug in Next.js')
    }
    if (typeof this.response === 'string') {
      throw new Error(
        'Invariant: static responses cannot be piped. This is a bug in Next.js'
      )
    }

    return await pipeReadable(this.response, res)
  }
}
