'use client'

import Link, { useLinkStatus } from 'next/link'
import { ComponentProps } from 'react'

export function LinkWithPendingIndicator({
  children,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      {children} <PendingIndicator />
    </Link>
  )
}

function PendingIndicator() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span data-pending style={{ color: 'gray' }}>
      Pending...
    </span>
  )
}
