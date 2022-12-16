'use client'

import {
  useSelectedLayoutSegments,
  useSelectedLayoutSegment,
} from 'next/navigation'

export default function Page() {
  const selectedLayoutSegments = useSelectedLayoutSegments()
  const selectedLayoutSegment = useSelectedLayoutSegment()

  return (
    <>
      <p id="page-layout-segments">{JSON.stringify(selectedLayoutSegments)}</p>
      <p id="page-layout-segment">{JSON.stringify(selectedLayoutSegment)}</p>
    </>
  )
}
