import { Suspense } from 'react'

async function Content({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  return <p id="catchall">{slug.join('/')}</p>
}

export default function Page(props: { params: Promise<{ slug: string[] }> }) {
  return (
    <Suspense fallback="Loading params...">
      <Content {...props} />
    </Suspense>
  )
}
