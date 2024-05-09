import { isNotFoundError } from '../../../../client/components/not-found'
import { isForbiddenError } from '../../../../client/components/forbidden'

const uiErrorTypesWithStatusCodesMap = {
  'not-found': {
    statusCode: 404,
    matcher: isNotFoundError,
    helperName: 'notFound',
  },
  forbidden: {
    statusCode: 403,
    matcher: isForbiddenError,
    helperName: 'forbidden',
  },
} as const

const uiErrorTypesWithStatusCodes = Object.keys(
  uiErrorTypesWithStatusCodesMap
) as (keyof typeof uiErrorTypesWithStatusCodesMap)[]

type UIErrorType = keyof typeof uiErrorTypesWithStatusCodesMap

export { uiErrorTypesWithStatusCodes, uiErrorTypesWithStatusCodesMap }

export type { UIErrorType }
