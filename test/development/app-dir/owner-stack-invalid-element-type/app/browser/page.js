'use client'

import dynamic from 'next/dynamic'

const BrowserOnly = dynamic(() => import('./browser-only'), {
  ssr: false,
})

// Intermediate component for testing owner stack
function Inner() {
  return <BrowserOnly />
}

export default function Page() {
  return <Inner />
}
