import React, { experimental_use as use } from 'react'
import { AppRouterContext } from '../../shared/lib/app-router-context'
import { createInfinitePromise } from './infinite-promise'

export const REDIRECT_ERROR_CODE = 'NEXT_REDIRECT'

export function redirect(url: string) {
  if (process.browser) {
    const router = use(AppRouterContext)
    setTimeout(() => {
      // @ts-ignore startTransition exists
      React.startTransition(() => {
        router.replace(url, {})
      })
    })
    // setTimeout is used to start a new transition during render, this is an intentional hack around React.
    use(createInfinitePromise())
  }
  // eslint-disable-next-line no-throw-literal
  throw {
    url,
    code: REDIRECT_ERROR_CODE,
  }
}
