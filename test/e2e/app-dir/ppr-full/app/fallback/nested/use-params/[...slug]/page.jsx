'use client'

import { useParams } from 'next/navigation'
import { use } from 'react'

export default function Page() {
  const params = useParams()

  use(new Promise((resolve) => setTimeout(resolve, 1000)))

  return <div data-slug={params.slug.join('/')}>{params.slug.join('/')}</div>
}
