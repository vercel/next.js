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
