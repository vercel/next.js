import * as React from 'react'

import UnrelatedComponent from './unrelated'

const LazyClientComponent = React.lazy(() => import('./client'))

async function CachedComponent() {
  'use cache'

  console.log('cached component executed')

  return (
    <>
      <LazyClientComponent />
      <UnrelatedComponent />
    </>
  )
}

export default function Page() {
  return (
    <>
      pagessss <CachedComponent />
    </>
  )
}
