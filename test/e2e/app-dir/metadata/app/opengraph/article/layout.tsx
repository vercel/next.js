export default function Layout({ children }) {
  return children
}

export const metadata = {
  openGraph: {
    title: 'Layout open graph title',
    description: 'My custom description',
    type: 'article',
    publishedTime: '2023-01-01T00:00:00.000Z',
    authors: ['author1', 'author2', 'author3'],
    images: new URL('https://example.com/og-image.jpg'),
  },
}
