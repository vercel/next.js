import type { COMPILER_NAMES } from '../../../../../shared/lib/constants'

import { errorToJSON } from '../../../../render'

export function serializeError(err: Error): Error & {
  statusCode?: number
  source?: typeof COMPILER_NAMES.server | typeof COMPILER_NAMES.edgeServer
} {
  if (process.env.NODE_ENV === 'development') {
    return errorToJSON(err)
  }

  return {
    name: 'Internal Server Error.',
    message: '500 - Internal Server Error.',
    statusCode: 500,
  }
}
