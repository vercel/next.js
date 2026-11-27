'use client'

import dynamic from 'next/dynamic'

export const ClientImageLoader = dynamic(() => import('./client-image'), {
  ssr: false,
})
