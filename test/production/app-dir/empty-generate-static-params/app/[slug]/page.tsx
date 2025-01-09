import { Suspense } from 'react'

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <div>
      Hello World
      <div>
        <Params params={params} />
      </div>
    </div>
  )
}

async function Params({ params }: { params: Promise<{ slug: string }> }) {
  return <Suspense>{(await params).slug}</Suspense>
}

export async function generateStaticParams() {
  return []
}
