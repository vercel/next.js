'use client'

import type { ReactNode } from 'react'

export function Thrower(): ReactNode {
  // This log runs on the server during SSR. It is also printed a second time
  // per request because reading `errorInfo.componentStack` in the app render
  // error handler makes React re-invoke this component to detect its stack
  // frame.
  console.log('__thrower_invoked__')

  throw new Error('recoverable-ssr-error')
}
