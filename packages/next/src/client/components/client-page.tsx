'use client'

import type { ParsedUrlQuery } from 'querystring'
import { InvariantError } from '../../shared/lib/invariant-error'

import type { Params } from '../../server/request/params'

/**
 * When the Page is a client component we send the params and searchParams to this client wrapper
 * where they are turned into dynamically tracked values before being passed to the actual Page component.
 *
 * additionally we may send promises representing the params and searchParams. We don't ever use these passed
 * values but it can be necessary for the sender to send a Promise that doesn't resolve in certain situations.
 * It is up to the caller to decide if the promises are needed.
 */
export function ClientPageRoot({
  Component,
  searchParams,
  params,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  promises,
}: {
  Component: React.ComponentType<any>
  searchParams: ParsedUrlQuery
  params: Params
  promises?: Array<Promise<any>>
}) {
  if (typeof window === 'undefined') {
    const { workAsyncStorage } =
      require('../../server/app-render/work-async-storage.external') as typeof import('../../server/app-render/work-async-storage.external')

    let clientSearchParams: Promise<ParsedUrlQuery>
    let clientParams: Promise<Params>
    // We are going to instrument the searchParams prop with tracking for the
    // appropriate context. We wrap differently in prerendering vs rendering
    const store = workAsyncStorage.getStore()
    if (!store) {
      throw new InvariantError(
        'Expected workStore to exist when handling searchParams in a client Page.'
      )
    }

    const { createSearchParamsFromClient } =
      require('../../server/request/search-params') as typeof import('../../server/request/search-params')
    clientSearchParams = createSearchParamsFromClient(searchParams, store)

    const { createParamsFromClient } =
      require('../../server/request/params') as typeof import('../../server/request/params')
    clientParams = createParamsFromClient(params, store)

    return <Component params={clientParams} searchParams={clientSearchParams} />
  } else {
    const { createRenderSearchParamsFromClient } =
      require('../../server/request/search-params.browser') as typeof import('../../server/request/search-params.browser')
    const clientSearchParams = createRenderSearchParamsFromClient(searchParams)
    const { createRenderParamsFromClient } =
      require('../../server/request/params.browser') as typeof import('../../server/request/params.browser')
    const clientParams = createRenderParamsFromClient(params)

    return <Component params={clientParams} searchParams={clientSearchParams} />
  }
}
