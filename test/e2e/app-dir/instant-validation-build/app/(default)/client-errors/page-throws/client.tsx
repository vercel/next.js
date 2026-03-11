'use client'

import { useSearchParams } from 'next/navigation'

export function ThrowsInClient(): Promise<never> {
  useSearchParams()
  throw new Error('Kaboom')
}
