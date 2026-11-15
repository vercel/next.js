'use client'

import { use } from 'react'
import { ShallowControls } from '../shallow-controls'

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = use(searchParams)
  return (
    <main>
      <p id="q">{q ?? '(none)'}</p>
      <ShallowControls />
    </main>
  )
}
