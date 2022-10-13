'use client'

import { headers } from 'next/headers'

export default function Page() {
  // This should throw an error.
  headers()

  return null
}
