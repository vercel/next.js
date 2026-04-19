'use client'

import { useServerInsertedHTML } from 'next/navigation'

export function Client() {
  useServerInsertedHTML(() => (
    <>
      <meta name="client-inserted-key" content="client-inserted-value" />
    </>
  ))
  return null
}
