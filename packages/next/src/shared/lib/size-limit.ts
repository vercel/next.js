import type { SizeLimit } from '../../types'

export const DEFAULT_MAX_POSTPONED_STATE_SIZE: SizeLimit = '100 MB'

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
  return parseSizeLimit(size ?? DEFAULT_MAX_POSTPONED_STATE_SIZE)
}
