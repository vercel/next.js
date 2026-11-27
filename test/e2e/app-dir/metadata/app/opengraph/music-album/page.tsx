import type { Metadata } from 'next'

export const metadata: Metadata = {
  openGraph: {
    type: 'music.album',
    songs: { url: 'https://example.com/song', disc: 1, track: 2 },
    musicians: 'https://example.com/musician',
  },
}

export default function Page() {
  return 'music album'
}
