export default function Layout({ children }) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  )
}

export const metadata = {
  title: 'this is the layout title',
  description: 'this is the layout description',
  keywords: ['nextjs', 'react'],
  other: {
    custom: 'meta',
    custom1: ['meta1', 'meta2'],
  },
}
