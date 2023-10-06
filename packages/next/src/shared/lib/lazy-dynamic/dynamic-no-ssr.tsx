'use client'

import React from 'react'
import { DynamicNoSSRError } from './no-ssr-error'

export function suspense() {
  throw new DynamicNoSSRError()
}

type Child = React.ReactElement<any, any>

export function NoSSR({ children }: { children: Child }): Child {
  if (typeof window === 'undefined') {
    suspense()
  }

  return children
}
