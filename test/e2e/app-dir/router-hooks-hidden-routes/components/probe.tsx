'use client'

import { useParams, usePathname } from 'next/navigation'

/**
 * Renders the params of the segment it is rendered in (passed from the server
 * component) next to what `useParams()` and `usePathname()` return.
 */
export function Probe({
  label,
  segmentParams,
}: {
  label: string
  segmentParams: Record<string, string>
}) {
  const params = useParams()
  const pathname = usePathname()
  return (
    <p
      data-probe={label}
      data-segment-params={JSON.stringify(segmentParams)}
      data-params={JSON.stringify(params)}
      data-pathname={pathname}
    >
      {label}: pathname={pathname} params={JSON.stringify(params)}
    </p>
  )
}
