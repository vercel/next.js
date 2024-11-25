'use client'

import { InvariantError } from '../../shared/lib/invariant-error'

import type { Params } from '../../server/request/params'

/**
 * When the Page is a client component we send the params to this client wrapper
 * where they are turned into dynamically tracked values before being passed to the actual Segment component.
 *
 * additionally we may send a promise representing params. We don't ever use this passed
 * value but it can be necessary for the sender to send a Promise that doesn't resolve in certain situations
 * such as when dynamicIO is enabled. It is up to the caller to decide if the promises are needed.
 */
export function ClientSegmentRoot({
  Component,
  slots,
  params,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  promise,
}: {
  Component: React.ComponentType<any>
  slots: { [key: string]: React.ReactNode }
  params: Params
  promise?: Promise<any>
}) {
  if (typeof window === 'undefined') {
    const { workAsyncStorage } =
      require('../../server/app-render/work-async-storage.external') as typeof import('../../server/app-render/work-async-storage.external')

    let clientParams: Promise<Params>
    // We are going to instrument the searchParams prop with tracking for the
    // appropriate context. We wrap differently in prerendering vs rendering
    const store = workAsyncStorage.getStore()
    if (!store) {
      throw new InvariantError(
        'Expected workStore to exist when handling params in a client segment such as a Layout or Template.'
      )
    }

    const { createParamsFromClient } =
      require('../../server/request/params') as typeof import('../../server/request/params')
    clientParams = createParamsFromClient(params, store)

    return <Component {...slots} params={clientParams} />
  } else {
    const { createRenderParamsFromClient } =
      require('../../server/request/params.browser') as typeof import('../../server/request/params.browser')
    const clientParams = createRenderParamsFromClient(params)
    return <Component {...slots} params={clientParams} />
  }
}
