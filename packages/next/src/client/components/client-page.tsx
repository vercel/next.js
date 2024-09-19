'use client'

import type { ParsedUrlQuery } from 'querystring'
import { use } from 'react'
import { InvariantError } from '../../shared/lib/invariant-error'

import type { Params } from './params'

export function ClientPageRoot({
  Component,
  params,
  searchParams,
}: {
  Component: React.ComponentType<any>
  params: Params
  searchParams: Promise<ParsedUrlQuery>
}) {
  if (typeof window === 'undefined') {
    const { staticGenerationAsyncStorage } =
      require('./static-generation-async-storage.external') as typeof import('./static-generation-async-storage.external')

    let clientSearchParams: Promise<ParsedUrlQuery>
    let trackedParams: Params
    // We are going to instrument the searchParams prop with tracking for the
    // appropriate context. We wrap differently in prerendering vs rendering
    const store = staticGenerationAsyncStorage.getStore()
    if (!store) {
      throw new InvariantError(
        'Expected staticGenerationStore to exist when handling searchParams in a client Page.'
      )
    }

    if (store.isStaticGeneration) {
      // We are in a prerender context
      // We need to recover the underlying searchParams from the server
      const { reifyClientPrerenderSearchParams } =
        require('../../server/request/search-params') as typeof import('../../server/request/search-params')
      clientSearchParams = reifyClientPrerenderSearchParams(store)
    } else {
      // We are in a dynamic context and need to unwrap the underlying searchParams

      // We can't type that searchParams is passed but since we control both the definition
      // of this component and the usage of it we can assume it
      const underlying = use(searchParams)

      const { reifyClientRenderSearchParams } =
        require('../../server/request/search-params') as typeof import('../../server/request/search-params')
      clientSearchParams = reifyClientRenderSearchParams(underlying, store)
    }

    const { createDynamicallyTrackedParams } =
      require('./fallback-params') as typeof import('./fallback-params')

    trackedParams = createDynamicallyTrackedParams(params)
    return (
      <Component params={trackedParams} searchParams={clientSearchParams} />
    )
  } else {
    const underlying = use(searchParams)

    const { reifyClientRenderSearchParams } =
      require('../../server/request/search-params.browser') as typeof import('../../server/request/search-params.browser')
    const clientSearchParams = reifyClientRenderSearchParams(underlying)
    return <Component params={params} searchParams={clientSearchParams} />
  }
}
