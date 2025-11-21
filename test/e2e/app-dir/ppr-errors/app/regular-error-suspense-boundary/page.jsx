import React, { Suspense } from 'react'

export default async function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Foobar />
    </Suspense>
  )
}

async function Foobar() {
  throw new Error('Kaboom')
}
