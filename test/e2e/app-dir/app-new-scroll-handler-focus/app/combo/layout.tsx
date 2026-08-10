'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Input lives in a PARENT layout so it survives navigations that only change a
// child segment. Typing pushes a child path + search param.
export default function ComboLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [value, setValue] = useState('')

  return (
    <>
      <input
        autoFocus
        data-testid="combo-input"
        placeholder="Search"
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value
          setValue(nextValue)
          router.push('/combo/next?q=' + encodeURIComponent(nextValue))
        }}
      />
      {children}
    </>
  )
}
