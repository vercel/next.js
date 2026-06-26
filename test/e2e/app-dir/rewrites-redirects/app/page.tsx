'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

const Test = ({ page, href }: { page: string; href?: string }) => {
  const router = useRouter()
  href ??= `/${page}-before`

  return (
    <>
      <Link id={`link-${page}`} href={href}>
        Link to /{page}-before
      </Link>
      <button id={`button-${page}`} onClick={() => router.push(href)}>
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
      <Test page="config-rewrite" />
      <Test page="config-redirect" />
      <Test
        page="config-redirect-catchall"
        href="/config-redirect-catchall-before/thing"
      />
    </>
  )
}
