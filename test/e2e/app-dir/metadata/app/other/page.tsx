import type { Metadata } from 'next'

export default function Page() {
  return 'other'
}

export const metadata: Metadata = {
  other: [
    { name: 'customName', content: 'customName' },
    { property: 'customProperty', content: 'customProperty' },
  ],
}
