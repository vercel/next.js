import { Suspense } from 'react'

export function generateStaticParams() {
  return [{ slug: 'a' }]
}

async function Slug({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <p>app isr page {slug}</p>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <Suspense fallback={<p>loading</p>}>
      <Slug params={params} />
    </Suspense>
  )
}
