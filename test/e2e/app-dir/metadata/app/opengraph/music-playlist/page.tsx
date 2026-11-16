import type { Metadata } from 'next'

export const metadata: Metadata = {
  openGraph: {
    type: 'music.playlist',
    songs: 'https://example.com/song',
    creators: 'https://example.com/creator',
  },
}

export default function Page() {
  return 'music playlist'
}
