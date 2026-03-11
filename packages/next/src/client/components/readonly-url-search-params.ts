/**
 * ReadonlyURLSearchParams implementation shared between client and server.
 * This file is intentionally not marked as 'use client' or 'use server'
 * so it can be imported by both environments.
 */

/** @internal */
class ReadonlyURLSearchParamsError extends Error {
  constructor() {
    super(
      'Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams'
    )
  }
}

/**
 * A read-only version of URLSearchParams that throws errors when mutation methods are called.
 * This ensures that the URLSearchParams returned by useSearchParams() cannot be mutated.
 */
export class ReadonlyURLSearchParams extends URLSearchParams {
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
