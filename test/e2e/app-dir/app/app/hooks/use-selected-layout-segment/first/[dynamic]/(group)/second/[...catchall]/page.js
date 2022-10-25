'use client'

import { useSelectedLayoutSegments } from 'next/navigation'

export default function Page() {
  const selectedLayoutSegment = useSelectedLayoutSegments()

  return (
    <p id="page-layout-segments">{JSON.stringify(selectedLayoutSegment)}</p>
  )
}
