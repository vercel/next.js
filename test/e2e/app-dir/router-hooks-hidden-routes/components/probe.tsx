'use client'

import { useParams, usePathname } from 'next/navigation'

type ProbeCounts = { calls: number; renders: number }

declare global {
  interface Window {
    __probeCounts?: Record<string, ProbeCounts>
  }
}

// Counts are client-only and kept out of the DOM, so prerendered HTML doesn't
// mismatch.
function count(key: string, field: keyof ProbeCounts) {
  if (typeof window !== 'undefined') {
    const counts = (window.__probeCounts ??= {})
    counts[key] ??= { calls: 0, renders: 0 }
    counts[key][field]++
  }
}

/**
 * Renders the params of the segment it is rendered in (passed from the server
 * component) next to what `useParams()` and `usePathname()` return.
 *
 * `calls` counts every call of this component. React also calls a component
 * when a context it reads might have changed, and discards the result if the
 * values it read are unchanged (a bailout). `renders` counts the calls whose
 * output React used, through a child that only renders then.
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

  const key = `${label}:${JSON.stringify(segmentParams)}`
  count(key, 'calls')

  return (
    <p
      data-probe={label}
      data-segment-params={JSON.stringify(segmentParams)}
      data-params={JSON.stringify(params)}
      data-pathname={pathname}
    >
      {label}: pathname={pathname} params={JSON.stringify(params)}
      <RenderCounter probeKey={key} />
    </p>
  )
}

function RenderCounter({ probeKey }: { probeKey: string }) {
  count(probeKey, 'renders')
  return null
}
