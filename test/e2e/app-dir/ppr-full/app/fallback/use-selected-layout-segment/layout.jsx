'use client'
import { useSelectedLayoutSegment } from 'next/navigation'
import { Suspense } from 'react'

function Dynamic() {
  const segment = useSelectedLayoutSegment()

  return <div data-slug={segment}>{segment}</div>
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
