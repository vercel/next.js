export default function Page() {
  return 'opengraph-article'
}

export const metadata = {
  openGraph: {
    title: 'My custom title',
    description: 'My custom description',
    type: 'article',
    publishedTime: '2023-01-01T00:00:00.000Z',
    authors: ['author1', 'author2', 'author3'],
  },
}
