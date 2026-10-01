'use client'

import { use } from 'react'

export default function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string }>
}) {
  const { id } = use(params)
  const { q } = use(searchParams)

  return (
    <>
      <p id="id">{id}</p>
      <p id="q">{q ?? ''}</p>
      <input
        id="input"
        onChange={(e) => {
          const url = new URL(window.location.href)
          url.searchParams.set('q', e.target.value)
          window.history.replaceState(null, '', url)
        }}
      />
    </>
  )
}
