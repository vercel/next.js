'use client'

import { use } from 'react'
import { ShallowControls } from '../../shallow-controls'

export default function Page({
  params,
}: {
  params: Promise<{ value: string }>
}) {
  const { value } = use(params)
  return (
    <main>
      <p id="value">{value}</p>
      <ShallowControls />
    </main>
  )
}
