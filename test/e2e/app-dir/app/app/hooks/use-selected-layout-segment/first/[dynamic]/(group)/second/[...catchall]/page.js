'use client'

import { useSelectedLayoutSegment } from 'next/navigation'

export default function Page() {
  const selectedLayoutSegment = useSelectedLayoutSegment()

  return (
    <p id="page-layout-segments">{JSON.stringify(selectedLayoutSegment)}</p>
  )
}
