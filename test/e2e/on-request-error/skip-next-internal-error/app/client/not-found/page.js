'use client'

import { notFound } from 'next/navigation'

export default function Page() {
  notFound()
}

export const dynamic = 'force-dynamic'
