import { Suspense } from 'react'
import { Links } from '../../../components/links'

async function Slug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p id="content">Rewrite target content: {slug}</p>
}

// The destination of the catch-all afterFiles rewrite in `next.config.ts`.
export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <>
      <h1 id="page">Rewrite target</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Slug params={params} />
      </Suspense>
      <Links />
    </>
  )
}
