'use client'

import { useState } from 'react'

interface PageProps {
  params: { slug: string }
  searchParams: any
}

export default function Page({ params }: PageProps) {
  const [text, setText] = useState('')
  // usage of `params`
  globalThis.f1(params)
  globalThis.f2(params)
}
