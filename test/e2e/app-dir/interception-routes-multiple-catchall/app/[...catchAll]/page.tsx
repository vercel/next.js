import Link from 'next/link'
import React from 'react'

async function Page({ params }: { params: Promise<{ catchAll: string[] }> }) {
  const { catchAll } = await params
  return (
    <div className="text-lg">
      Showcase Simple Page
      <Link href={`/templates/${catchAll.join('/')}`}>
        templates {catchAll.join(' -> ')}
      </Link>
    </div>
  )
}

export default Page
