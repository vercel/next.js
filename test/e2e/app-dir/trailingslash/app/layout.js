export default function Root({ children }) {
  return (
    <html>
      <head>
        <title>Hello</title>
      </head>
      <body>{children}</body>
    </html>
  )
}

export const metadata = {
  metadataBase: new URL('http://trailingslash.com'),
  alternates: {
    canonical: './',
  },
}
