import { Suspense } from 'react'

async function Dynamic() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <div>Custom Data</div>
}

export default async function Page({
  params,
}: {
  params: Promise<{ 'my-slug': string; two: string }>
}) {
  const { 'my-slug': mySlug, two } = await params

  return (
    <div>
      <div>
        {mySlug}:{two}
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}
