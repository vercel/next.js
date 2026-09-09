'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'

type CatalogLinkProps = Omit<ComponentProps<typeof Link>, 'prefetch'> & {
  eager?: boolean
}

export function CatalogLink({ eager = false, ...props }: CatalogLinkProps) {
  return <Link {...props} prefetch={eager ? true : 'auto'} />
}
