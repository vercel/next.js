import React, { Suspense } from 'react'
import { TriggerBadSuspenseFallback } from './client'
import { getDynamicTestData, getStaticTestData } from '../test-data-service'

async function Dynamic({ dataKey }) {
  return (
    <div id="dynamic">{await getDynamicTestData(`${dataKey} [dynamic]`)}</div>
  )
}

async function Static({ dataKey }) {
  return <div id="static">{await getStaticTestData(`${dataKey} [static]`)}</div>
}

export default async function Page({
  params,
}: {
  params: Promise<{ dataKey: string }>
}) {
  const { dataKey } = await params
  return (
    <>
      <div id="container">
        <Suspense fallback="Loading dynamic...">
          <Dynamic dataKey={dataKey} />
        </Suspense>
        <Suspense fallback="Loading static...">
          <Static dataKey={dataKey} />
        </Suspense>
      </div>
      <TriggerBadSuspenseFallback />
    </>
  )
}
