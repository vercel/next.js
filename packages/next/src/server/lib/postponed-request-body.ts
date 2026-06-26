import {
  DEFAULT_MAX_POSTPONED_STATE_SIZE,
  parseMaxPostponedStateSize,
} from '../../shared/lib/size-limit'
import type { SizeLimit } from '../../types'

const INVALID_MAX_POSTPONED_STATE_SIZE_ERROR_MESSAGE =
  'maxPostponedStateSize must be a valid number (bytes) or filesize format string (e.g., "5mb")'

export type PostponedRequestBodyChunk = Buffer | Uint8Array | string

export function getMaxPostponedStateSize(
  configuredMaxPostponedStateSize: SizeLimit | undefined
): {
  maxPostponedStateSize: SizeLimit
  maxPostponedStateSizeBytes: number
} {
  const maxPostponedStateSize =
    configuredMaxPostponedStateSize ?? DEFAULT_MAX_POSTPONED_STATE_SIZE
  const maxPostponedStateSizeBytes = parseMaxPostponedStateSize(
    configuredMaxPostponedStateSize
  )

  if (maxPostponedStateSizeBytes === undefined) {
    throw new Error(INVALID_MAX_POSTPONED_STATE_SIZE_ERROR_MESSAGE)
  }

  return { maxPostponedStateSize, maxPostponedStateSizeBytes }
}

export function getPostponedStateExceededErrorMessage(
  maxPostponedStateSize: SizeLimit
): string {
  return (
    `Postponed state exceeded ${maxPostponedStateSize} limit. ` +
    `To configure the limit, see: https://nextjs.org/docs/app/api-reference/config/next-config-js/max-postponed-state-size`
  )
}

function toBuffer(chunk: PostponedRequestBodyChunk): Buffer {
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
}

export async function readBodyWithSizeLimit(
  body: AsyncIterable<PostponedRequestBodyChunk>,
  maxBodySizeBytes: number
): Promise<Buffer | null> {
  const chunks: Array<Buffer> = []
  let size = 0

  for await (const chunk of body) {
    const buffer = toBuffer(chunk)
    size += buffer.byteLength
    if (size > maxBodySizeBytes) {
      return null
    }
    chunks.push(buffer)
  }

  return Buffer.concat(chunks)
}

/**
 * Decodes the postponed-state request body. PPR resume requests can arrive
 * compressed (e.g. `gzip` applied by a proxy/CDN that issues the resume
 * request); reading the raw bytes as UTF-8 without decompressing yields an
 * invalid postponed state.
 *
 * The request's `Content-Encoding` is honored when present. Because some
 * proxies compress the body without forwarding that header, a leading gzip
 * magic number is also detected: a valid serialized postponed state always
 * begins with `<len>:` (an ASCII digit or `:`, `0x30`–`0x3a`), so a leading
 * `0x1f 0x8b` is unambiguous and safe to decompress.
 *
 * Decompression is bounded by `maxOutputLength` (the same postponed-state size
 * limit applied to the raw body) so a small compressed payload cannot expand to
 * an unbounded amount of memory; zlib throws `ERR_BUFFER_TOO_LARGE` if exceeded.
 */
export function decodePostponedRequestBody(
  body: Buffer,
  contentEncoding: string | string[] | undefined,
  maxOutputLength: number
): string {
  const { gunzipSync, brotliDecompressSync, inflateSync } =
    require('node:zlib') as typeof import('node:zlib')

  const encoding = (
    Array.isArray(contentEncoding) ? contentEncoding[0] : contentEncoding
  )?.toLowerCase()

  switch (encoding) {
    case 'gzip':
      return gunzipSync(body, { maxOutputLength }).toString('utf8')
    case 'br':
      return brotliDecompressSync(body, { maxOutputLength }).toString('utf8')
    case 'deflate':
      return inflateSync(body, { maxOutputLength }).toString('utf8')
    default:
      break
  }

  if (body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b) {
    return gunzipSync(body, { maxOutputLength }).toString('utf8')
  }

  return body.toString('utf8')
}
