'use client'

import { use } from 'react'

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const { query } = use(searchParams)
  return (
    <main>
      <h1>Query {query}</h1>
    </main>
  )
}
