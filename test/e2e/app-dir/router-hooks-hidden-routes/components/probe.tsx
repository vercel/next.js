'use client'

import { Suspense } from 'react'
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
  useSelectedLayoutSegments,
} from 'next/navigation'

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

type ProbeProps = {
  label: string
  segmentParams: Record<string, string>
}

/**
 * Renders the params of the segment it is rendered in (passed from the server
 * component) next to what `useParams()`, `usePathname()` and
 * `useSearchParams()` return.
 *
 * `useSearchParams()` makes the prerender dynamic at this point, so the probe
 * renders inside its own Suspense boundary.
 */
export function Probe(props: ProbeProps) {
  return (
    <Suspense>
      <ProbeImpl {...props} />
    </Suspense>
  )
}

/**
 * `calls` counts every call of this component. React also calls a component
 * when a context it reads might have changed, and discards the result if the
 * values it read are unchanged (a bailout). `renders` counts the calls whose
 * output React used, through a child that only renders then.
 */
function ProbeImpl({ label, segmentParams }: ProbeProps) {
  const params = useParams()
  const pathname = usePathname()
  const search = useSearchParams().toString()

  const key = `${label}:${JSON.stringify(segmentParams)}`
  count(key, 'calls')

  return (
    <p
      data-probe={label}
      data-segment-params={JSON.stringify(segmentParams)}
      data-params={JSON.stringify(params)}
      data-pathname={pathname}
      data-search={search}
    >
      {label}: pathname={pathname} params={JSON.stringify(params)} search=
      {search}
      <RenderCounter probeKey={key} />
    </p>
  )
}

function RenderCounter({ probeKey }: { probeKey: string }) {
  count(probeKey, 'renders')
  return null
}

/**
 * Probes for the hooks that read the segment they are called in rather than
 * the URL: `useRouter()` and `useSelectedLayoutSegments()`. Each hook has its
 * own probe, so that the counts tell which hook made a component render.
 */
export function SegmentHooksProbe(props: ProbeProps) {
  return (
    <Suspense>
      <RouterProbe {...props} />
      <SelectedSegmentsProbe {...props} />
    </Suspense>
  )
}

function RouterProbe({ label, segmentParams }: ProbeProps) {
  const router = useRouter()
  const key = hookProbeKey('useRouter', label, segmentParams)
  count(key, 'calls')
  return (
    <HookProbeOutput
      hook="useRouter"
      label={label}
      segmentParams={segmentParams}
      value={router.bfcacheId}
    />
  )
}

function SelectedSegmentsProbe({ label, segmentParams }: ProbeProps) {
  const segments = useSelectedLayoutSegments()
  const key = hookProbeKey('useSelectedLayoutSegments', label, segmentParams)
  count(key, 'calls')
  return (
    <HookProbeOutput
      hook="useSelectedLayoutSegments"
      label={label}
      segmentParams={segmentParams}
      value={segments.join('/')}
    />
  )
}

function hookProbeKey(
  hook: string,
  label: string,
  segmentParams: Record<string, string>
) {
  return `${hook}:${label}:${JSON.stringify(segmentParams)}`
}

// Only renders when React used the output of the component that reads the
// hook, so it counts `renders`.
function HookProbeOutput({
  hook,
  label,
  segmentParams,
  value,
}: ProbeProps & { hook: string; value: string }) {
  count(hookProbeKey(hook, label, segmentParams), 'renders')
  return (
    <p
      data-hook-probe={hook}
      data-label={label}
      data-segment-params={JSON.stringify(segmentParams)}
      data-value={value}
    >
      {hook} in {label}: {value}
    </p>
  )
}
