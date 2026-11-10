'use client'

import { captureOwnerStack } from 'react'

export function LogOwnerStack() {
  if (typeof window === 'undefined') {
    // During SSR, the owners of this Client Component are Server Components.
    // Their frames come from fake functions created by the SSR Flight client.
    const ownerStack = captureOwnerStack()
    const error = new Error('ssr-owner-stack')
    error.stack = 'Error: ssr-owner-stack' + ownerStack
    console.error(error)
    // The unsourcemapped owner stack, to check which URLs the fake functions
    // were created with.
    console.log('ssr-owner-stack raw: ' + JSON.stringify(ownerStack))
  }
  return null
}
