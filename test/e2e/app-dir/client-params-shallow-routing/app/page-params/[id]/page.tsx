'use client'

import { use } from 'react'
import { ShallowControls } from '../../shallow-controls'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <main>
      <p id="id">{id}</p>
      <ShallowControls />
    </main>
  )
}
