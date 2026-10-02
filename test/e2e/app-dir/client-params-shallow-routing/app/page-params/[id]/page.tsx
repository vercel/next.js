'use client'

import { use, useState } from 'react'
import { ShallowControls } from '../../shallow-controls'

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [initialParams] = useState(params)
  return (
    <main>
      <p id="id">{id}</p>
      <p id="params-identity">
        {params === initialParams ? 'same' : 'different'}
      </p>
      <ShallowControls />
    </main>
  )
}
