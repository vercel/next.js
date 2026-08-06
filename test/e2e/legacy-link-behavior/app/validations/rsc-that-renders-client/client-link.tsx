'use client'

import Link from 'next/link'
import { ComponentProps } from 'react'

export function ClientLink(props: ComponentProps<typeof Link>) {
  return <Link legacyBehavior passHref {...props} />
}
