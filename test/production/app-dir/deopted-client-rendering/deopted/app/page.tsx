'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'

export const dynamic = 'error'

function ComponentThatUsesSearchParams() {
  const searchParams = useSearchParams()
  return <h1>Hello {searchParams.get('name')}</h1>
}

export default function Page() {
  return (
    // missing Suspense, will get deopted
    <ComponentThatUsesSearchParams />
  )
}
