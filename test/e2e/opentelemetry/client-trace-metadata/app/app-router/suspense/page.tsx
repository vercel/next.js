import React, { Suspense } from 'react'
import { Client } from './client'

async function Component() {
  await new Promise((resolve) => setTimeout(resolve, 200))
  return (
    <div>
      <h1>Component</h1>
      <Client />
    </div>
  )
}

function Suspensey() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Component />
    </Suspense>
  )
}

export default function Page() {
  return <Suspensey />
}

export const dynamic = 'force-dynamic'
