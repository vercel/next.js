import type { COMPILER_NAMES } from '../../../../../shared/lib/constants'

import { errorToJSON } from '../../../../render'

export function serializeError(
  dev: boolean | undefined,
  err: Error
): Error & {
  statusCode?: number
  source?: typeof COMPILER_NAMES.server | typeof COMPILER_NAMES.edgeServer
} {
  if (dev) {
    return errorToJSON(err)
  }

  return {
    name: 'Internal Server Error.',
    message: '500 - Internal Server Error.',
    statusCode: 500,
  }
}
