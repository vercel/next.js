import { ReadonlyHeaders } from 'next/dist/server/web/spec-extension/adapters/headers'
import React from 'react'
import { getUserAgent } from './lib'
import { ServerComp } from './server-comp'
import { headers } from 'next/headers'

async function indirect(headers: Promise<ReadonlyHeaders>) {
  return await getUserAgent(headers)
}

export default function Page() {
  return (
    <>
      <p>This page accesses headers in the root layout.</p>
      <ServerComp promise={indirect(headers())} />
    </>
  )
}
