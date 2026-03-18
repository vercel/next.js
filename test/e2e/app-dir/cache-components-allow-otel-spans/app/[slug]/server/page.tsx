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
