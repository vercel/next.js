'use client'

import dynamic from 'next/dynamic'

const BrowserOnly = dynamic(() => import('./browser-only'), {
  ssr: false,
})

export default function Page() {
  return <BrowserOnly />
}
