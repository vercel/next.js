'use client'

import { Suspense, use } from 'react'

import { getSentinelValue } from '../../getSentinelValue'

export default function Page({ searchParams }: { searchParams: Promise<any> }) {
  return (
    <>
      <p>
        This page reads `searchParams.foo` in a client component context with a
        parent Suspense boundary.
      </p>
      <p>
        With PPR this page can be partially static because the dynamic API usage
        is inside a suspense boundary.
      </p>
      <p>
        Without PPR this page is fully dynamic because a dynamic API was used.
      </p>
      <Suspense fallback={<Fallback>loading...</Fallback>}>
        <ComponentOne searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<Fallback>loading too...</Fallback>}>
        <ComponentTwo />
      </Suspense>
      <div id="page">{getSentinelValue()}</div>
    </>
  )
}

function ComponentOne({ searchParams }: { searchParams: Promise<any> }) {
  let sentinelSearch
  const sp = use(searchParams)
  try {
    if (sp.sentinel) {
      sentinelSearch = sp.sentinel
    } else {
      sentinelSearch = '~not-found~'
    }
  } catch (e) {
    sentinelSearch = '~thrown~'
    // swallow any throw. We should still not be static
  }
  return (
    <div>
      This component accessed `searchParams.sentinel`: "
      <span id="value">{sentinelSearch}</span>"
    </div>
  )
}

function ComponentTwo() {
  return (
    <>
      <div>This component didn't access any searchParams properties</div>
      <div id="inner">{getSentinelValue()}</div>
    </>
  )
}

function Fallback({ children }) {
  return children
}
