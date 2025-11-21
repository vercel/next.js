'use client'

import { useSelectedLayoutSegments } from 'next/navigation'

export default function Layout({ children }: { children: React.ReactNode }) {
  // useSelectedLayoutSegment should not be thrown
  useSelectedLayoutSegments()
  return children
}

export const runtime = 'edge'
