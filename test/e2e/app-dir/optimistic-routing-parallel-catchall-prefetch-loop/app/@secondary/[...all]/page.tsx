import { Suspense } from 'react'

async function Secondary({ params }: { params: Promise<{ all: string[] }> }) {
  const { all } = await params
  return <aside id="secondary-slot">Secondary {all.join('/')}</aside>
}

export default function SecondaryPage({
  params,
}: {
  params: Promise<{ all: string[] }>
}) {
  return (
    <Suspense fallback={null}>
      <Secondary params={params} />
    </Suspense>
  )
}
