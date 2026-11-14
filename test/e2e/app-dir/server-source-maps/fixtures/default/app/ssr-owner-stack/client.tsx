'use client'

import { captureOwnerStack } from 'react'

export function LogOwnerStack() {
  // `captureOwnerStack` is only exported by development builds of React.
  if (
    typeof window === 'undefined' &&
    typeof captureOwnerStack === 'function'
  ) {
    // During SSR, the owners of this Client Component are Server Components.
    // Their frames come from fake functions created by the SSR Flight client.
    const ownerStack = captureOwnerStack()
    const error = new Error('ssr-owner-stack')
    error.stack = 'Error: ssr-owner-stack' + ownerStack
    console.error(error)
  }
  return null
}
