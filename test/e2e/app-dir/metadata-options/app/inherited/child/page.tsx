import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Child',
  other: { childOnly: 'child', overridden: 'child' },
}

export const viewport: Viewport = { viewportFit: 'cover' }

export default function Page() {
  return <p>Inherited metadata options</p>
}
