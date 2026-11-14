import type { Metadata } from 'next'

export const metadata: Metadata = {
  openGraph: {
    videos: [{ url: 'https://example.com/custom.mp4', type: 'video/mp4' }],
  },
}

export default function Page() {
  return <p>override</p>
}
