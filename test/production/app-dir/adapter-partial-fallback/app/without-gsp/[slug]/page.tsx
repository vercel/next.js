import { Suspense } from 'react'

async function Dynamic() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <div>Custom Data</div>
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <div>
      <div>{slug}</div>
      <Suspense fallback={<div>Loading...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}
