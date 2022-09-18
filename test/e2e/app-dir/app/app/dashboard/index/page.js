import { LazyClientComponent } from './dynamic-imports/react-lazy-client'
import { NextDynamicServerComponent } from './dynamic-imports/dynamic-server'
import { NextDynamicClientComponent } from './dynamic-imports/dynamic-client'

import { useEffect } from 'react'

export default function DashboardIndexPage() {
  return (
    <>
      <p>hello from app/dashboard/index</p>
      <NextDynamicServerComponent />
      <NextDynamicClientComponent />
      <LazyClientComponent />
    </>
  )
}
