'use client'

import { use, useState, type ReactNode } from 'react'

export default function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [initialParams] = useState(params)
  return (
    <main>
      <p id="id">{id}</p>
      <p id="params-identity">
        {params === initialParams ? 'same' : 'different'}
      </p>
      {children}
    </main>
  )
}
