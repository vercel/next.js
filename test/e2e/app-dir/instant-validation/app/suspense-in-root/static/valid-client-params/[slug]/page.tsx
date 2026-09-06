'use client'

import { use } from 'react'

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  return (
    <main>
      <h1>Slug: {slug}</h1>
    </main>
  )
}
