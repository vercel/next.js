import React from 'react'
import { createSearchParamsBailoutProxy } from './searchparams-bailout-proxy'

export default function StaticGenerationSearchParamsBailoutProvider({
  Component,
  propsForComponent,
  enabled,
}: {
  Component: React.ComponentType<any>
  propsForComponent: any
  enabled: boolean
}) {
  if (enabled) {
    const searchParams = createSearchParamsBailoutProxy()
    return <Component searchParams={searchParams} {...propsForComponent} />
  }

  return <Component {...propsForComponent} />
}
