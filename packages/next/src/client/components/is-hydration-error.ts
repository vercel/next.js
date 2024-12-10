'use client'

import type { ParsedUrlQuery } from 'querystring'
import { InvariantError } from '../../shared/lib/invariant-error'
import type { Params } from '../../server/request/params'

/**
 * Utility to handle client-side or server-side parameter wrapping.
 * Handles searchParams and params transformation with proper context.
 */
function getClientParamsAndSearchParams(
  searchParams: ParsedUrlQuery,
  params: Params,
  store?: any,
  isServer: boolean = true
) {
  if (isServer) {
    const { createSearchParamsFromClient } =
      require('../../server/request/search-params') as typeof import('../../server/request/search-params')
    const { createParamsFromClient } =
      require('../../server/request/params') as typeof import('../../server/request/params')

    const clientSearchParams = createSearchParamsFromClient(searchParams, store)
    const clientParams = createParamsFromClient(params, store)

    return { clientSearchParams, clientParams }
  } else {
    const { createRenderSearchParamsFromClient } =
      require('../../server/request/search-params.browser') as typeof import('../../server/request/search-params.browser')
    const { createRenderParamsFromClient } =
      require('../../server/request/params.browser') as typeof import('../../server/request/params.browser')

    const clientSearchParams = createRenderSearchParamsFromClient(searchParams)
    const clientParams = createRenderParamsFromClient(params)

    return { clientSearchParams, clientParams }
  }
}

/**
 * When the Page is a client component, we send the params and searchParams to this client wrapper
 * where they are turned into dynamically tracked values before being passed to the actual Page component.
 */
export function ClientPageRoot({
  Component,
  searchParams,
  params,
  promises,
}: {
  Component: React.ComponentType<any>
  searchParams: ParsedUrlQuery
  params: Params
  promises?: Array<Promise<void>>
}) {
  if (typeof window === 'undefined') {
    const { workAsyncStorage } =
      require('../../server/app-render/work-async-storage.external') as typeof import('../../server/app-render/work-async-storage.external')

    const store = workAsyncStorage.getStore()
    if (!store) {
      throw new InvariantError(
        'Expected workStore to exist when handling searchParams in a client Page.'
      )
    }

    const { clientSearchParams, clientParams } = getClientParamsAndSearchParams(
      searchParams,
      params,
      store,
      true
    )

    return <Component params={clientParams} searchParams={clientSearchParams} />
  } else {
    const { clientSearchParams, clientParams } = getClientParamsAndSearchParams(
      searchParams,
      params,
      undefined,
      false
    )

    return <Component params={clientParams} searchParams={clientSearchParams} />
  }
}

