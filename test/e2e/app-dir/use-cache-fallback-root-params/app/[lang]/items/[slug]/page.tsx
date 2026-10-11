import { Suspense } from 'react'
import { CachedLanguage } from '../../cached'

export function generateStaticParams() {
  return [{ slug: 'one' }]
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <>
      <Suspense fallback={<p id="cached-pending">Loading language</p>}>
        <CachedLanguage />
      </Suspense>
      <Suspense fallback={<p id="slug-pending">Loading item</p>}>
        <Item params={params} />
      </Suspense>
    </>
  )
}

async function Item({ params }: { params: Promise<{ slug: string }> }) {
  return <p>{(await params).slug}</p>
}
