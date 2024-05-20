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

type UIErrorsWithStatusCodesMap = typeof uiErrorsWithStatusCodesMap
type UIErrorFileType = keyof UIErrorsWithStatusCodesMap

const uiErrorFileTypes = Object.keys(
  uiErrorsWithStatusCodesMap
) as UIErrorFileType[]

const uiErrorStatusCodes = Object.values(uiErrorsWithStatusCodesMap).map(
  (x) => +x.statusCode
)

function matchUIError(err: unknown) {
  return uiErrorFileTypes.find((errorType) =>
    uiErrorsWithStatusCodesMap[errorType].matcher(err)
  )
}

function getUIErrorStatusCode(type: UIErrorFileType) {
  return uiErrorsWithStatusCodesMap[type].statusCode
}

function getUIErrorHelperName(type: UIErrorFileType) {
  return uiErrorsWithStatusCodesMap[type].helperName
}

type UIErrorHelper = UIErrorsWithStatusCodesMap[UIErrorFileType]['helperName']

export {
  uiErrorFileTypes,
  uiErrorsWithStatusCodesMap,
  uiErrorStatusCodes,
  matchUIError,
  getUIErrorStatusCode,
  getUIErrorHelperName,
}

export type { UIErrorFileType, UIErrorHelper }
