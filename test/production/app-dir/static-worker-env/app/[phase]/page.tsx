// Both run in the build's static workers: `generateStaticParams` while
// collecting page data, the page while prerendering.
export function generateStaticParams() {
  return [{ phase: process.env.NEXT_PHASE ?? 'unset' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ phase: string }>
}) {
  const { phase } = await params
  return (
    <>
      <p id="param-phase">{phase}</p>
      <p id="render-phase">{process.env.NEXT_PHASE ?? 'unset'}</p>
    </>
  )
}
