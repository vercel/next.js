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

export { redirect, permanentRedirect, RedirectType } from './redirect'
export { notFound } from './not-found'
export { ReadonlyURLSearchParams }
