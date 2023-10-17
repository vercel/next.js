'use client'
import React from 'react'
import { createSearchParamsBailoutProxy } from './searchparams-bailout-proxy'

export default function StaticGenerationSearchParamsBailoutProvider({
  Component,
  propsForComponent,
  isStaticGeneration,
}: {
  Component: React.ComponentType<any>
  propsForComponent: any
  isStaticGeneration: boolean
}) {
  if (isStaticGeneration) {
    const searchParams = createSearchParamsBailoutProxy()
    return <Component searchParams={searchParams} {...propsForComponent} />
  }

  return <Component {...propsForComponent} />
}
