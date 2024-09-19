'use client'

import type { ParsedUrlQuery } from 'querystring'
import { use } from 'react'
import { InvariantError } from '../../shared/lib/invariant-error'

import type { Params } from '../../server/request/params'

export function ClientPageRoot({
  C /* Component */,
  sp /* searchParams */,
  p /* params */,
  up /* underlying params */,
  fp /* fallback param names */,
}: {
  C /* Component */ : React.ComponentType<any>
  sp /* searchParams */ : Promise<ParsedUrlQuery>
  p /* params */ : Promise<Params>
  up? /* underlying params */ : Params
  fp? /* fallback param names */ : Set<string>
}) {
  if (typeof window === 'undefined') {
    const { staticGenerationAsyncStorage } =
      require('./static-generation-async-storage.external') as typeof import('./static-generation-async-storage.external')

    let clientSearchParams: Promise<ParsedUrlQuery>
    let clientParams: Promise<Params>
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

      const { reifyClientPrerenderParams } =
        require('../../server/request/params') as typeof import('../../server/request/params')

      const fallbackParamNames = fp
      if (fallbackParamNames) {
        // the params promise won't ever resolve because we're in a PPR fallback prerender
        // We instead expect there to be an underlying params object which gives the client
        // access to the params that can be used to reify an aborting or interrupting params
        // object.
        const underlyingParams = up
        if (!underlyingParams) {
          throw new InvariantError(
            `In route ${store.route}, expected params to be available to client Segment but none were found.`
          )
        }
        clientParams = reifyClientPrerenderParams(
          underlyingParams,
          fallbackParamNames,
          store
        )
      } else {
        const underlyingParams = use(p)
        clientParams = reifyClientPrerenderParams(
          underlyingParams,
          undefined,
          store
        )
      }
    } else {
      // We are in a dynamic context and need to unwrap the underlying searchParams

      // We can't type that searchParams is passed but since we control both the definition
      // of this component and the usage of it we can assume it
      const underlyingSearchParams = use(sp)
      const underlyingParams = use(p)

      const { reifyClientRenderSearchParams } =
        require('../../server/request/search-params') as typeof import('../../server/request/search-params')
      clientSearchParams = reifyClientRenderSearchParams(
        underlyingSearchParams,
        store
      )
      const { reifyClientRenderParams } =
        require('../../server/request/params') as typeof import('../../server/request/params')
      clientParams = reifyClientRenderParams(underlyingParams, store)
    }

    return <C params={clientParams} searchParams={clientSearchParams} />
  } else {
    const underlyingSearchParams = use(sp)
    const underlyingParams = use(p)

    const { reifyClientRenderSearchParams } =
      require('../../server/request/search-params.browser') as typeof import('../../server/request/search-params.browser')
    const clientSearchParams = reifyClientRenderSearchParams(
      underlyingSearchParams
    )
    const { reifyClientRenderParams } =
      require('../../server/request/params.browser') as typeof import('../../server/request/params.browser')
    const clientParams = reifyClientRenderParams(underlyingParams)

    return <C params={clientParams} searchParams={clientSearchParams} />
  }
}
