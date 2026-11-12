import { redirect } from 'next/navigation'
import { Suspense } from 'react'

const REDIRECTS: Record<string, string> = {
  '/old/a': '/docs/one',
  '/old/b': '/docs/two',
}

export function generateStaticParams() {
  return ['one', 'two', 'three'].map((name) => ({ slug: ['docs', name] }))
}

async function Content({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const path = `/${slug.join('/')}`
  if (REDIRECTS[path]) {
    redirect(REDIRECTS[path])
  }
  return <h1 id="heading">{path}</h1>
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  return (
    <Suspense fallback={null}>
      <Content params={params} />
    </Suspense>
  )
}
