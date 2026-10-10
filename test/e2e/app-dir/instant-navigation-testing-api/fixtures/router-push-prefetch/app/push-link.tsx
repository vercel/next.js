'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

/**
 * A `prefetch={true}` link that cancels its own click and navigates with
 * `router.push()` instead, which is how page-transition wrappers defer a
 * navigation until an exit animation has run.
 */
export default function PushLink({
  href,
  id,
  children,
}: {
  href: string
  id: string
  children: ReactNode
}) {
  const router = useRouter()

  return (
    <Link
      href={href}
      id={id}
      prefetch={true}
      onClick={(event) => {
        event.preventDefault()
        requestAnimationFrame(() => {
          router.push(href)
        })
      }}
    >
      {children}
    </Link>
  )
}
