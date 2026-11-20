import { Suspense } from 'react'

type Params = Promise<{ slug: string[] }>

export function generateStaticParams() {
  return [{ slug: ['docs', 'one'] }]
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense>
      <Slug params={params} />
    </Suspense>
  )
}

async function Slug({ params }: { params: Params }) {
  const { slug } = await params
  return <h1 id="slug">{slug.join('/')}</h1>
}
