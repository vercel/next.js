'use client'

import { Suspense, use } from 'react'

function Content({ params }: { params: Promise<{ category: string }> }) {
  const { category } = use(params)
  return <h1 id="category-header">Category: {category}</h1>
}

export default function CategoryLayout({
  params,
  children,
}: {
  params: Promise<{ category: string }>
  children: React.ReactNode
}) {
  return (
    <div>
      <Suspense fallback="Loading...">
        <Content params={params} />
      </Suspense>
      {children}
    </div>
  )
}
