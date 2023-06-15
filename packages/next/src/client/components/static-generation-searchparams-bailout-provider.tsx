'use client'
import React from 'react'
import { createSearchParamsBailoutProxy } from './searchparams-bailout-proxy'

export default function StaticGenerationSearchParamsBailoutProvider({
  Component,
  propsForComponent,
}: {
  Component: React.ComponentType<any>
  propsForComponent: any
}) {
  const searchParams = createSearchParamsBailoutProxy()
  return <Component searchParams={searchParams} {...propsForComponent} />
}
