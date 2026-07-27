'use client'

import {
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from 'next/navigation'

export default function RenderValues({ prefix }: { prefix: string }) {
  return (
    <div id={prefix}>
      <div className="segments">
        {JSON.stringify(useSelectedLayoutSegments())}
      </div>
      <div className="segment">
        {JSON.stringify(useSelectedLayoutSegment())}
      </div>
    </div>
  )
}
