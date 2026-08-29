import { Suspense } from 'react'

async function Header({ params }: { params: Promise<{ all: string[] }> }) {
  const { all } = await params
  return <header id="header-slot">Header {all.join('/')}</header>
}

export default function HeaderPage({
  params,
}: {
  params: Promise<{ all: string[] }>
}) {
  return (
    <Suspense fallback={null}>
      <Header params={params} />
    </Suspense>
  )
}
