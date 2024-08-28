'use client'
import { useSelectedLayoutSegments } from 'next/navigation'
import { Suspense, use } from 'react'

function Dynamic() {
  const segments = useSelectedLayoutSegments()

  use(new Promise((resolve) => setTimeout(resolve, 1000)))

  return <div data-slug={segments.join('/')}>{segments.join('/')}</div>
}

export default function Layout({ children }) {
  return (
    <>
      <Suspense fallback={<div data-fallback>Dynamic Loading...</div>}>
        <Dynamic />
      </Suspense>
      {children}
    </>
  )
}
