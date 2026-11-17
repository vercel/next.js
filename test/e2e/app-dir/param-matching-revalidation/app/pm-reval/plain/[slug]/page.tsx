import { Suspense } from 'react'
import { getStamp } from '../../../stamp'

export function generateStaticParams() {
  return [{ slug: 'a' }]
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <>
      <p id="params">{slug}</p>
      <p id="stamp">{await getStamp('plain', slug)}</p>
    </>
  )
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <Suspense fallback={<p id="pending">Loading</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  )
}
