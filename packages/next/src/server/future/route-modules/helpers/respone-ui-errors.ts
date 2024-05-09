import { isNotFoundError } from '../../../../client/components/not-found'
import { isForbiddenError } from '../../../../client/components/forbidden'

const uiErrorTypesWithStatusCodesMap = {
  'not-found': {
    statusCode: 404,
    matcher: isNotFoundError,
  },
  forbidden: {
    statusCode: 403,
    matcher: isForbiddenError,
  },
} as const

const uiErrorTypesWithStatusCodes = Object.keys(
  uiErrorTypesWithStatusCodesMap
) as (keyof typeof uiErrorTypesWithStatusCodesMap)[]

export { uiErrorTypesWithStatusCodes, uiErrorTypesWithStatusCodesMap }
