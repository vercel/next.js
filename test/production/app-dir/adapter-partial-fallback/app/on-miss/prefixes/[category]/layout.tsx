import { Suspense, type ReactNode } from 'react'

export function generateStaticParams() {
  return [{ category: 'static' }, { category: 'partial' }]
}

export default async function Layout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  return (
    <main>
      <h1>Category: {category}</h1>
      <Suspense fallback={<p>Loading slug</p>}>{children}</Suspense>
    </main>
  )
}
