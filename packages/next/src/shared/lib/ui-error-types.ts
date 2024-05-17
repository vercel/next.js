import { isNotFoundError } from '../../client/components/not-found'
import { isForbiddenError } from '../../client/components/forbidden'

const uiErrorsWithStatusCodesMap = {
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

const uiErrorFileTypes = Object.keys(
  uiErrorsWithStatusCodesMap
) as (keyof typeof uiErrorsWithStatusCodesMap)[]

type UIErrorsWithStatusCodesMap = typeof uiErrorsWithStatusCodesMap

type UIErrorFileType = keyof UIErrorsWithStatusCodesMap

type UIErrorHelper = UIErrorsWithStatusCodesMap[UIErrorFileType]['helperName']

export { uiErrorFileTypes, uiErrorsWithStatusCodesMap }

export type { UIErrorFileType, UIErrorHelper }
