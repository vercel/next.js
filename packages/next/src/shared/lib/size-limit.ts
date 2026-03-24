import type { SizeLimit } from '../../types'

export const DEFAULT_MAX_POSTPONED_STATE_SIZE: SizeLimit = '100 MB'

// 100MB in bytes. Not using the parseSizeLimit for performance as parseMaxPostponedStateSize is in the hot path for rendering.
const DEFAULT_MAX_POSTPONED_STATE_SIZE_BYTES = 104_857_600

function parseSizeLimit(size: SizeLimit): number | undefined {
  const bytes = (
    require('next/dist/compiled/bytes') as typeof import('next/dist/compiled/bytes')
  ).parse(size)
  if (bytes === null || isNaN(bytes) || bytes < 1) {
    return undefined
  }
  return bytes
}

/**
 * Parses the maxPostponedStateSize config value, using the default if not provided.
 */
export function parseMaxPostponedStateSize(
  size: SizeLimit | undefined
): number | undefined {
  if (!size) {
    return DEFAULT_MAX_POSTPONED_STATE_SIZE_BYTES
  }
  return parseSizeLimit(size)
}
