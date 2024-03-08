'use client'

import { useSearchParams } from 'next/navigation'

function SearchParams() {
  useSearchParams()
  return null
}

export default function Page() {
  return (
    <>
      <SearchParams />
      <div>Page</div>
    </>
  )
}
