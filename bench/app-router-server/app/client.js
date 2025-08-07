'use client'

import dynamic from 'next/dynamic'

const Client = dynamic(() => import('./client2'), {
  ssr: false,
})

export default Client
