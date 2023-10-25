import React, { Suspense } from 'react'
import { cookies } from 'next/headers'

import { Dynamic } from '../../../../components/dynamic'

export default async function Page() {
  return (
    <>
      <h2>Dynamic Component Catching Errors</h2>
      <p>
        This shows the dynamic component that reads cookies but wraps the read
        in a try/catch.
      </p>
      <div id="container">
        <Suspense fallback={<Dynamic fallback />}>
          <Dynamic catchErrors />
        </Suspense>

        <Suspense fallback={<div>Loading...</div>}>
          <Foobar />
        </Suspense>
      </div>
    </>
  )
}

async function Foobar() {
  try {
    cookies()
  } catch (err) {
    throw new Error('You are not signed in')
  }
  return null
}
