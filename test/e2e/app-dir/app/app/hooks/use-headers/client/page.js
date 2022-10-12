'use client'

import { headers } from 'next/dist/client/components/hooks-server'

export default function Page() {
  // This should throw an error.
  headers()

  return null
}
