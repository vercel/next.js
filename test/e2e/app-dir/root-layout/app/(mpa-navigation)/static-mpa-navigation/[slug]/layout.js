export default function Layout({ children }) {
  return (
    <html>
      <head>
        <title>Hello</title>
      </head>
      <body>{children}</body>
    </html>
  )
}

export function generateStaticParams() {
  return [{ slug: 'slug1' }, { slug: 'slug2' }]
}
