import React from 'react'
import { createInfinitePromise } from './infinite-promise'

export function redirect(url: string) {
  setTimeout(() => {
    // @ts-ignore startTransition exists
    React.startTransition(() => {
      // TODO-APP: handle redirect
      // @ts-expect-error TODO:-APP: fix this
      window.nd.router.replace(url, {})
    })
  })
  // setTimeout is used to start a new transition during render, this is an intentional hack around React.
  use(createInfinitePromise())
}
