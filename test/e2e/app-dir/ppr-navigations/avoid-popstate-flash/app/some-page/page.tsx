import React, { Suspense } from 'react'
import { getDynamicTestData, getStaticTestData } from '../test-data-service'
import { Fallback } from './client'

async function Dynamic() {
  return <div id="dynamic">{await getDynamicTestData('Dynamic')}</div>
}

async function Static() {
  return <div id="static">{await getStaticTestData('Static')}</div>
}

export default async function Page() {
  return (
    <div id="container">
      <Suspense fallback={<Fallback>Loading dynamic...</Fallback>}>
        <Dynamic />
      </Suspense>
      <Suspense fallback={<Fallback>Loading static...</Fallback>}>
        <Static />
      </Suspense>
    </div>
  )
}
