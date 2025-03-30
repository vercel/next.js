'use client'

import { useSearchParams, unauthorized } from 'next/navigation'

export default function ForbiddenTrigger() {
  const searchParams = useSearchParams()

  if (searchParams.get('root-unauthorized')) {
    unauthorized()
  }
  return null
}
