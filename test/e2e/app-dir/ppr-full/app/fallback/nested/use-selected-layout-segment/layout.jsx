'use client'
import { useSelectedLayoutSegment } from 'next/navigation'
import { Suspense, use } from 'react'

function Dynamic() {
  const segment = useSelectedLayoutSegment()

  use(new Promise((resolve) => setTimeout(resolve, 1000)))

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
