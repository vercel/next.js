import React, { Suspense } from 'react'
import { getDynamicTestData, getStaticTestData } from '../test-data-service'
import Link from 'next/link'

async function Dynamic({ dataKey }) {
  return (
    <div id="dynamic">{await getDynamicTestData(`${dataKey} [dynamic]`)}</div>
  )
}

async function Static({ dataKey }) {
  return <div id="static">{await getStaticTestData(`${dataKey} [static]`)}</div>
}

export default async function Page() {
  return (
    <>
      <Link href="/">Home</Link>
      <Suspense fallback="Loading dynamic...">
        <Dynamic dataKey="Some data" />
      </Suspense>
      <Suspense fallback="Loading static...">
        <Static dataKey="Some data" />
      </Suspense>
    </>
  )
}
