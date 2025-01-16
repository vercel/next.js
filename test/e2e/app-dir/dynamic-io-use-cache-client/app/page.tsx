import React from 'react'
import { Client } from './client'

export default function Page() {
  return (
    <main>
      <CachedComponent />
    </main>
  )
}

async function CachedComponent() {
  'use cache'
  return (
    <>
      Cached Component: <Client />
    </>
  )
}
