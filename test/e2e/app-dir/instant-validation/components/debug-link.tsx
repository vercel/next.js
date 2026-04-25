'use client'

import Link from 'next/link'
import { ComponentProps } from 'react'

export function DebugLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, 'children' | 'href'> & { href: string }) {
  return (
    <Link href={href} {...props}>
      {href}
    </Link>
  )
}

export function DebugLinkMPA({
  href,
  ...props
}: Omit<ComponentProps<'a'>, 'children'>) {
  return (
    <a href={href} {...props}>
      {href}
    </a>
  )
}
