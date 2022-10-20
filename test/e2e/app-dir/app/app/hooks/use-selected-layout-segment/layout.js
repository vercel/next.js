'use client'

import { useSelectedLayoutSegment } from 'next/navigation'

export default function Layout({ children }) {
  const selectedLayoutSegment = useSelectedLayoutSegment()

  return (
    <>
      <p id="outer-layout">{JSON.stringify(selectedLayoutSegment)}</p>
      {children}
    </>
  )
}
