'use client'
import { useSelectedLayoutSegments } from 'next/navigation'
import { Suspense } from 'react'

function Dynamic() {
  const segments = useSelectedLayoutSegments()

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
