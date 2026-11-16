'use client'

import { useRouter } from 'next/navigation'
import { useRef } from 'react'

type PreparedNavigation = ReturnType<
  NonNullable<ReturnType<typeof useRouter>['experimental_prepare']>
>

// The intended usage pattern: start the navigation on pointerdown, and commit
// it on click. A plain anchor rather than <Link>, so it doesn't prefetch.
export function PrepareLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const prepared = useRef<PreparedNavigation | null>(null)
  return (
    <a
      href={href}
      data-prepare-link={href}
      onPointerDown={() => {
        prepared.current = router.experimental_prepare!(href)
      }}
      onClick={(event) => {
        event.preventDefault()
        prepared.current!.push()
      }}
    >
      {children}
    </a>
  )
}
