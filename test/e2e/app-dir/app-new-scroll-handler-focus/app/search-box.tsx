'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function SearchBox({ testId }: { testId: string }) {
  const router = useRouter()
  const [value, setValue] = useState('')

  return (
    <input
      autoFocus
      data-testid={testId}
      placeholder="Search"
      value={value}
      onChange={(event) => {
        const nextValue = event.target.value
        setValue(nextValue)
        router.push('?q=' + encodeURIComponent(nextValue))
      }}
    />
  )
}
