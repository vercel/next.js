import { Suspense } from 'react'
import { getSharedValue, getValueForSlug } from '../data'

export function generateStaticParams() {
  return [{ slug: 'a' }]
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <>
      <p id="for-slug">{await getValueForSlug(slug)}</p>
      <p id="shared">{await getSharedValue()}</p>
    </>
  )
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Content params={params} />
    </Suspense>
  )
}
