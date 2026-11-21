import type { Metadata } from 'next'

export const metadata: Metadata = {
  alternates: { canonical: '/guide' },
}

export default function GuidePage() {
  return <h1>Guide</h1>
}
