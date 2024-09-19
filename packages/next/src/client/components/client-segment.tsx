'use client'

import { use } from 'react'
import { InvariantError } from '../../shared/lib/invariant-error'

import type { Params } from '../../server/request/params'

export function ClientSegmentRoot({
  C /* Component */,
  c /* parallel route props */,
  p /* params */,
  up /* underlying params */,
  fp /* fallback param names */,
}: {
  C /* Component */ : React.ComponentType<any>
  c /* parallel route props */ : { [key: string]: React.ReactNode }
  p /* params */ : Promise<Params>
  up? /* underlying params */ : Params
  fp? /* fallback param names */ : Set<string>
}) {
  if (typeof window === 'undefined') {
    const { staticGenerationAsyncStorage } =
      require('./static-generation-async-storage.external') as typeof import('./static-generation-async-storage.external')

    let clientParams: Promise<Params>
    // We are going to instrument the searchParams prop with tracking for the
    // appropriate context. We wrap differently in prerendering vs rendering
    const store = staticGenerationAsyncStorage.getStore()
    if (!store) {
      throw new InvariantError(
        'Expected staticGenerationStore to exist when handling params in a client segment such as a Layout or Template.'
      )
    }

    const { reifyClientPrerenderParams } =
      require('../../server/request/params') as typeof import('../../server/request/params')

    if (store.isStaticGeneration) {
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
      const underlying = use(p)

      const { reifyClientRenderParams } =
        require('../../server/request/params') as typeof import('../../server/request/params')
      clientParams = reifyClientRenderParams(underlying, store)
    }
    return <C {...c} params={clientParams} />
  } else {
    const underlying = use(p)

    const { reifyClientRenderParams } =
      require('../../server/request/params.browser') as typeof import('../../server/request/params.browser')
    const clientParams = reifyClientRenderParams(underlying)
    return <C {...c} params={clientParams} />
  }
}
