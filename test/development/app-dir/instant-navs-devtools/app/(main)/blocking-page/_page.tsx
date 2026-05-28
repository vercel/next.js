'use client'

// import { useSearchParams } from 'next/navigation'
import { use } from 'react'

export default function Page({ searchParams }: PageProps<'/blocking-page'>) {
  const params = use(searchParams)

  return (
    <div>
      <p>foo: {params.foo}</p>
      <p>Blocking page</p>
    </div>
  )
}
