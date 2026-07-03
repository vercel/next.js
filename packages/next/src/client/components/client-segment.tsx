'use client'

import type { Params } from '../../server/request/params'
import { LayoutRouterContext } from '../../shared/lib/app-router-context.shared-runtime'
import { use } from 'react'
import { createClientParams } from './client-boundary-params'

/**
 * When the Page is a client component we send the params to this client wrapper
 * where they are turned into dynamically tracked values before being passed to the actual Segment component.
 *
 * additionally we may send a promise representing params. We don't ever use this passed
 * value but it can be necessary for the sender to send a Promise that doesn't resolve in certain situations
 * such as when cacheComponents is enabled. It is up to the caller to decide if the promises are needed.
 */
export function ClientSegmentRoot({
  Component,
  slots,
  serverProvidedParams,
}: {
  Component: React.ComponentType<any>
  slots: { [key: string]: React.ReactNode }
  serverProvidedParams: null | {
    params: Params
    promises: Array<Promise<any>> | null
  }
}) {
  let params: Params
  if (serverProvidedParams !== null) {
    params = serverProvidedParams.params
  } else {
    // When Cache Components is enabled, the server does not pass the params
    // as props; they are parsed on the client and passed via context.
    const layoutRouterContext = use(LayoutRouterContext)
    params =
      layoutRouterContext !== null ? layoutRouterContext.parentParams : {}
  }

  const clientParams = createClientParams(params)

  return <Component {...slots} params={clientParams} />
}
