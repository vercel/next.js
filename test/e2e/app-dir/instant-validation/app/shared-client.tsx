'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function LinkToSelfWithSearch({
  name,
  value,
}: {
  name: string
  value: string | null
}) {
  const pathname = usePathname()
  let href: string
  if (value === null) {
    href = pathname
  } else {
    href = pathname + '?' + new URLSearchParams([[name, value]])
  }

  return <Link href={href}>{href}</Link>
}
