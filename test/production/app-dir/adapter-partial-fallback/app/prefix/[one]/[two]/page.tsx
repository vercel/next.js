import { Suspense } from 'react'

async function Dynamic() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <div>Custom Data</div>
}

export default async function Page({
  params,
}: {
  params: Promise<{ one: string; two: string }>
}) {
  const { one, two } = await params

  return (
    <div>
      <div>
        {one}:{two}
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}
