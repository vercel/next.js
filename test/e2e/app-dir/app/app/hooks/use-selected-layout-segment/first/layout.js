'use client'

import { useSelectedLayoutSegments } from 'next/navigation'

export default function Layout({ children }) {
  const selectedLayoutSegment = useSelectedLayoutSegments()

  return (
    <>
      <p id="inner-layout">{JSON.stringify(selectedLayoutSegment)}</p>
      {children}
    </>
  )
}
