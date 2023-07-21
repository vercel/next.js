'use client'

import { useServerInsertedHTML } from 'next/navigation'

export function Inserted() {
  useServerInsertedHTML(() => {
    return <h1>inserted_data</h1>
  })

  return null
}
