import * as React from 'react'
import { Suspense } from 'react'

export default function Layout({ parallel }: { parallel: React.ReactNode }) {
  return (
    <>
      <h2>LAYOUT</h2>
      <Suspense fallback={<div id="timestamp">loading...</div>}>
        {parallel}
      </Suspense>
    </>
  )
}
