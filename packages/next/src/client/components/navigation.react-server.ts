/** @internal */
class ReadonlyURLSearchParamsError extends Error {
  constructor() {
    super(
      'Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams'
    )
  }
}

class ReadonlyURLSearchParams extends URLSearchParams {
  /** @deprecated Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams */
  append() {
    throw new ReadonlyURLSearchParamsError()
  }
  /** @deprecated Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams */
  delete() {
    throw new ReadonlyURLSearchParamsError()
  }
  /** @deprecated Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams */
  set() {
    throw new ReadonlyURLSearchParamsError()
  }
  /** @deprecated Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams */
  sort() {
    throw new ReadonlyURLSearchParamsError()
  }
}

export { redirect, permanentRedirect } from './redirect'
export { RedirectType } from './redirect-error'
export { notFound } from './not-found'
export { forbidden } from './forbidden'
export { unauthorized } from './unauthorized'
export { unstable_rethrow } from './unstable-rethrow'
export { ReadonlyURLSearchParams }
