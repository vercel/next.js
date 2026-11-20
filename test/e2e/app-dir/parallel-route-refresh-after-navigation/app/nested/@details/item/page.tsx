import { randomUUID } from 'node:crypto'
import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'

type PageProps = {
  searchParams: Promise<{ value?: string }>
}

export default function Page(props: PageProps) {
  return (
    <Suspense fallback={null}>
      <Details {...props} />
    </Suspense>
  )
}

async function Details({ searchParams }: PageProps) {
  await connection()
  const { value } = await searchParams
  return (
    <aside>
      <p id="nested-value">{value}</p>
      <p id="nested-render">{randomUUID()}</p>
      <Link id="nested-home" href="/nested/home?value=first" prefetch={false}>
        Home
      </Link>
    </aside>
  )
}
