import Link from 'next/link'
import React from 'react'

async function Page({ params }: { params: Promise<{ catchAll: string[] }> }) {
  const { catchAll } = await params
  return (
    <div>
      Simple Page
      <Link href={`/showcase/${catchAll.join('/')}`}>
        To Same Path <span className="opacity-70">{catchAll.join(' -> ')}</span>
      </Link>
      <Link href="/showcase/single">To Single Path</Link>
      <Link href="/showcase/another/slug">multi-slug</Link>
    </div>
  )
}

export default Page
