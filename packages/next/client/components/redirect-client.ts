import React, { experimental_use as use } from 'react'
import { AppRouterContext } from '../../shared/lib/app-router-context'
import { createInfinitePromise } from './infinite-promise'

export function redirect(url: string) {
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
