'use client'

import { Fragment } from 'react'
import { useSearchParams } from 'next/navigation'

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let searchParams = useSearchParams()
  return <Fragment key={searchParams.get('q')}>{children}</Fragment>
}
