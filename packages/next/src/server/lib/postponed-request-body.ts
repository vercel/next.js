import { brotliDecompressSync, gunzipSync, inflateSync } from 'zlib'
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

const MAX_OUTPUT_LENGTH_DEFAULT = 500 * 1024 * 1024

// Gzip magic number: the first two bytes of a gzip stream are 0x1f 0x8b.
// A valid postponed state serialized by Next.js always starts with a length
// prefix (ASCII digits, 0x30–0x3a), so there is no overlap with the gzip
// magic, making auto-detection safe when Content-Encoding is absent.
const GZIP_MAGIC_BYTES: Readonly<[number, number]> = [0x1f, 0x8b]

function hasGzipMagic(body: Buffer): boolean {
  return (
    body.length >= 2 &&
    body[0] === GZIP_MAGIC_BYTES[0] &&
    body[1] === GZIP_MAGIC_BYTES[1]
  )
}

export function decompressBody(
  body: Buffer,
  contentEncoding: string | undefined,
  maxOutputLength?: number
): Buffer {
  const maxLen = maxOutputLength ?? MAX_OUTPUT_LENGTH_DEFAULT

  if (contentEncoding) {
    switch (contentEncoding) {
      case 'deflate':
        return inflateSync(body, { maxOutputLength: maxLen })
      case 'gzip':
        return gunzipSync(body, { maxOutputLength: maxLen })
      case 'br':
        return brotliDecompressSync(body, { maxOutputLength: maxLen })
      default:
        return body
    }
  }

  // The PPR resume chain contract does not carry Content-Encoding, but
  // infrastructure (e.g. Vercel's router) may gzip the body without setting
  // the header. Auto-detect by checking the gzip magic number.
  if (hasGzipMagic(body)) {
    return gunzipSync(body, { maxOutputLength: maxLen })
  }

  return body
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
