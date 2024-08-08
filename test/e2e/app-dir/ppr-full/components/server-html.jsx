'use client'

import { useRef } from 'react'
import { useServerInsertedHTML } from 'next/navigation'

export function ServerHtml() {
  const ref = useRef(0)
  useServerInsertedHTML(() => {
    console.log('useServerInsertedHTML')
    return null
  })
  useServerInsertedHTML(() => (
    <meta name="server-html" content={ref.current++} />
  ))
}
