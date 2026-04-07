export default function Page() {
  return 'opengraph-video-tv-show'
}

export const metadata = {
  openGraph: {
    type: 'video.tv_show',
    title: 'My TV Show',
    actors: [
      { url: 'https://example.com/actor1', role: 'Lead' },
      'https://example.com/actor2',
    ],
    directors: ['https://example.com/director1'],
    writers: ['https://example.com/writer1'],
    duration: 3600,
    releaseDate: '2024-01-01T00:00:00.000Z',
    tags: ['drama', 'comedy'],
  },
}
