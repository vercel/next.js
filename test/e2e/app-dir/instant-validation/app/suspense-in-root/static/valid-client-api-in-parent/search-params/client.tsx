'use client'

import { useSearchParams } from 'next/navigation'

export function ShouldNotSuspendDuringValidation({ children }) {
  const search = useSearchParams()
  return (
    <>
      <div>Hello, browser! Search: "{search.toString()}"</div>
      <hr />
      {children}
    </>
  )
}
