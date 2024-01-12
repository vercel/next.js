'use client'

import type React from 'react'
import { throwWithNoSSR } from './no-ssr-error'

type Child = React.ReactElement<any, any>

export function NoSSR({ children }: { children: Child }): Child {
  if (typeof window === 'undefined') {
    throwWithNoSSR()
  }

  return children
}
