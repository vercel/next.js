'use client'

import { useRef } from 'react'
import { useServerInsertedHTML } from 'next/navigation'

export function InsertHtml({ id, data }: { id: string; data: string }) {
  const insertRef = useRef(false)
  useServerInsertedHTML(() => {
    // only insert the style tag once
    if (insertRef.current) {
      return
    }
    insertRef.current = true
    const value = (
      <style
        data-test-id={id}
      >{`[data-inserted-${data}] { content: ${data} }`}</style>
    )
    console.log(`testing-log-insertion:${data}`)
    return value
  })

  return <div>Loaded: {data}</div>
}
