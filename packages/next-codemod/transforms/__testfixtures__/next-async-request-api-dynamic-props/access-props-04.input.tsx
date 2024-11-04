'use client'

import { useState, type JSX } from 'react'

export default function Page({ params }: { params: { slug: string } }): JSX.Element {
  const [text, setText] = useState('')
  // usage of `params`
  globalThis.f1(params)
  globalThis.f2(params)
}
