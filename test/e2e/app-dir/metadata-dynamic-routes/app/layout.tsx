export default function Layout({ children }) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  )
}

export const metadata = {
  metadataBase: new URL('https://mydomain.com'),
  title: 'Next.js App',
  description: 'This is a Next.js App',
  twitter: {
    cardType: 'summary_large_image',
    title: 'Twitter - Next.js App',
    description: 'Twitter - This is a Next.js App',
  },
  alternates: {
    canonical: './',
  },
}
