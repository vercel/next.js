import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ slug: 'known' }]
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p>Static result: {slug}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <h1>Reusable initial content</h1>
      <Suspense fallback={<p>Loading params</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  )
}
