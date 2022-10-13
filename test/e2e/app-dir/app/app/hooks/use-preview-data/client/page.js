'use client'

import { previewData } from 'next/headers'

export default function Page() {
  // This should throw an error.
  previewData()

  return null
}
