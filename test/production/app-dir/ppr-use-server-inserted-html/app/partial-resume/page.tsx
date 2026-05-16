import React, { Suspense } from 'react'
import { headers } from 'next/headers'
import { InsertHtml } from './client'

async function Dynamic() {
  await headers()

  return (
    <div>
      <h3>dynamic</h3>
      <InsertHtml id={'inserted-html'} data={'dynamic-data'} />
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Dynamic />
    </Suspense>
  )
}
