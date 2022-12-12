'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

const Test = ({ page }: { page: string }) => {
  const router = useRouter()
  return (
    <>
      <Link id={`link-${page}`} href={`/${page}-before`}>
        Link to /{page}-before
      </Link>
      <button
        id={`button-${page}`}
        onClick={() => router.push(`/${page}-before`)}
      >
        Button to /{page}-before
      </button>
    </>
  )
}

export default function Page() {
  return (
    <>
      <Test page="middleware-rewrite" />
      <Test page="middleware-redirect" />
    </>
  )
}
