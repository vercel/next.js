'use client'

import dynamic from 'next/dynamic'

export const LazyClientWrapperWithNoSSR = dynamic(
  () => import('./client').then((mod) => mod.ClientWrapper),
  { ssr: false }
)
