import { Suspense } from 'react'

async function Dynamic() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <div id="agent">Custom Data</div>
}

export async function generateStaticParams() {
  return [{ slug: 'one' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <div>
      <div id="slug" data-slug={slug}>
        {slug}
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}
