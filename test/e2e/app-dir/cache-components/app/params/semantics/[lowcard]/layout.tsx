import { Suspense } from 'react'

import { getSentinelValue } from '../../../getSentinelValue'

export async function generateStaticParams() {
  return [
    {
      lowcard: 'one',
    },
  ]
}

export default function LowCardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Suspense
        fallback={<div id="lowcard-fallback">loading lowcard children</div>}
      >
        {children}
      </Suspense>
      <span id="lowcard">{getSentinelValue()}</span>
    </>
  )
}
