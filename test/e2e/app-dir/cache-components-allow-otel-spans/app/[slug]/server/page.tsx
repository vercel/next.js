import {
  CachedInnerTraceManualSpan,
  InnerTraceManualSpan,
  CachedTracedComponentManualSpan,
  TracedComponentManualSpan,
  CachedInnerTraceActiveSpan,
  InnerTraceActiveSpan,
  CachedTracedComponentActiveSpan,
  TracedComponentActiveSpan,
} from '../../traced-work'

// A navigation to an uncovered slug reads a deferred `params`, which is a
// blocking navigation. This suite exercises span creation during cache
// component validation, not Instant Navigation, so opt the route out of that
// validation: otherwise its blocking-route insight masks the `startActiveSpan`
// console error these tests assert.
export const instant = false

export function generateStaticParams() {
  return [{ slug: 'prerendered' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <>
      <h1>{(await params).slug}</h1>
      <div>We are inside a "use server" scope</div>
      <CachedInnerTraceManualSpan />
      <InnerTraceManualSpan />
      <CachedTracedComponentManualSpan />
      <TracedComponentManualSpan />
      <CachedInnerTraceActiveSpan />
      <InnerTraceActiveSpan />
      <CachedTracedComponentActiveSpan />
      <TracedComponentActiveSpan />
    </>
  )
}
