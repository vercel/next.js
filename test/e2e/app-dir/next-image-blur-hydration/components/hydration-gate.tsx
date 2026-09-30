'use client'

import { use, type ReactNode } from 'react'

declare global {
  interface Window {
    imageHydrationGate?: Promise<void>
    releaseImageHydration?: () => void
  }
}

export default function HydrationGate({ children }: { children: ReactNode }) {
  if (typeof window !== 'undefined' && window.imageHydrationGate) {
    use(window.imageHydrationGate)
  }
  return children
}
