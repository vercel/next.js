import { Suspense } from 'react'

export default function Page({
  params,
}: {
  params: Promise<{ top: string; bottom?: string }>
}) {
  return (
    <main>
      <p>Static content</p>
      <Suspense fallback={<p id="pending">Waiting for params</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  )
}

async function Content({
  params,
}: {
  params: Promise<{ top: string; bottom?: string }>
}) {
  const { top, bottom } = await params
  // Only concrete renders get a changing marker. Putting it in the generic
  // shell would make the cached HTML disagree with a later resumed render.
  return (
    <>
      <p id="params">{bottom ? `${top}/${bottom}` : top}</p>
      <p id="generation">{performance.timeOrigin + performance.now()}</p>
    </>
  )
}
