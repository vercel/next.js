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

// These routes exercise OTEL span creation during Cache Components validation.
// Automatic navigation-boundary insights are not the subject of this suite.
// Non-root params remain outside an App Shell even when statically available.
// The blocking opt-out keeps those insights from replacing the intentional
// `startActiveSpan` console error that the tests inspect.
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
