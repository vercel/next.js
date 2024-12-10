'use client'

import type { ParsedUrlQuery } from 'querystring'
import { InvariantError } from '../../shared/lib/invariant-error'

import type { Params } from '../../server/request/params'

/**
 * Handles the rendering of a client component page with instrumented params and searchParams
 * for dynamic tracking, ensuring compatibility for server and client environments.
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
  promises?: Array<Promise<any>>
}) {
  if (typeof window === 'undefined') {
    const { workAsyncStorage } = require('../../server/app-render/work-async-storage.external') as typeof import('../../server/app-render/work-async-storage.external')

    const store = workAsyncStorage.getStore()
    if (!store) {
      throw new InvariantError(
        'Expected workStore to exist when handling searchParams in a client Page.'
      )
    }

    const { createSearchParamsFromClient } = require('../../server/request/search-params') as typeof import('../../server/request/search-params')
    const clientSearchParams = createSearchParamsFromClient(searchParams, store)

    const { createParamsFromClient } = require('../../server/request/params') as typeof import('../../server/request/params')
    const clientParams = createParamsFromClient(params, store)

    return <Component params={clientParams} searchParams={clientSearchParams} />
  } else {
    const { createRenderSearchParamsFromClient } = require('../../server/request/search-params.browser') as typeof import('../../server/request/search-params.browser')
    const clientSearchParams = createRenderSearchParamsFromClient(searchParams)

    const { createRenderParamsFromClient } = require('../../server/request/params.browser') as typeof import('../../server/request/params.browser')
    const clientParams = createRenderParamsFromClient(params)

    return <Component params={clientParams} searchParams={clientSearchParams} />
  }
}

