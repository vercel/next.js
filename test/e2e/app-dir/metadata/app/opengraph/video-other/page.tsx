export default function Page() {
  return 'opengraph-video-other'
}

export const metadata = {
  openGraph: {
    type: 'video.other',
    title: 'My Other Video',
    actors: ['https://example.com/actor1'],
    directors: ['https://example.com/director1'],
    writers: ['https://example.com/writer1'],
    duration: 120,
    releaseDate: '2024-06-15T00:00:00.000Z',
    tags: ['short-film'],
  },
}
