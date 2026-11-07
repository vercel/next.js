import * as React from 'react'

import UnrelatedComponent from './unrelated'

const LazyClientComponent = React.lazy(() => import('./client'))

async function CachedComponent() {
  'use cache'

  return (
    <>
      <LazyClientComponent />
      <UnrelatedComponent />
    </>
  )
}

export default function Page() {
  return <CachedComponent />
}
