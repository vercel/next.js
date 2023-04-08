'use client'

import {
  useSelectedLayoutSegments,
  useSelectedLayoutSegment,
} from 'next/navigation'

export default function Layout({ children }) {
  const selectedLayoutSegments = useSelectedLayoutSegments()
  const selectedLayoutSegment = useSelectedLayoutSegment()

  return (
    <>
      <p id="outer-layout">{JSON.stringify(selectedLayoutSegments)}</p>
      <p id="outer-layout-segment">{JSON.stringify(selectedLayoutSegment)}</p>
      {children}
    </>
  )
}
