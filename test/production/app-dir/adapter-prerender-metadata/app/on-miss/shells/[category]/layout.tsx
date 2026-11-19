import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ category: 'first' }, { category: 'second' }]
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
      {children}
    </main>
  )
}
