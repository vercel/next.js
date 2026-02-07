import { Suspense } from 'react'

import { getSentinelValue } from '../../../../getSentinelValue'

export async function generateStaticParams() {
  return [
    {
      highcard: 'build',
    },
  ]
}

export default function HighardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Suspense
        fallback={<div id="highcard-fallback">loading highcard children</div>}
      >
        {children}
      </Suspense>
      <span id="highcard">{getSentinelValue()}</span>
    </>
  )
}
