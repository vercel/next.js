import { ReadonlyURLSearchParams } from './readonly-url-search-params'

export function unstable_isUnrecognizedActionError(): boolean {
  throw new Error(
    '`unstable_isUnrecognizedActionError` can only be used on the client.'
  )
}

export { redirect, permanentRedirect } from './redirect'
export { RedirectType } from './redirect-error'
export { notFound } from './not-found'
export { forbidden } from './forbidden'
export { unauthorized } from './unauthorized'
export { unstable_rethrow } from './unstable-rethrow'
export { ReadonlyURLSearchParams }
