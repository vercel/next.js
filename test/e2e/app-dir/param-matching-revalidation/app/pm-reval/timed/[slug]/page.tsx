import { Suspense } from 'react'
import { getTimedStamp } from '../../../stamp'

export const unstable_paramMatching = { slug: 'blocking' } as const

export function generateStaticParams() {
  return [{ slug: 'a' }]
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <>
      <p id="params">{slug}</p>
      <p id="stamp">{await getTimedStamp(slug)}</p>
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
