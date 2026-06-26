'use client'

import { useSearchParams, forbidden } from 'next/navigation'

export default function ForbiddenTrigger() {
  const searchParams = useSearchParams()

  if (searchParams.get('root-forbidden')) {
    forbidden()
  }
  return null
}
