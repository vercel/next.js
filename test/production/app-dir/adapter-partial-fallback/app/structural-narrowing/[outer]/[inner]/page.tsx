import { Suspense } from 'react'

async function Dynamic() {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return <div>Custom Data</div>
}

export function generateStaticParams() {
  return [{ outer: 'a', inner: 'x' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ outer: string; inner: string }>
}) {
  const { outer, inner } = await params

  return (
    <div>
      <div>
        {outer}/{inner}
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <Dynamic />
      </Suspense>
    </div>
  )
}
