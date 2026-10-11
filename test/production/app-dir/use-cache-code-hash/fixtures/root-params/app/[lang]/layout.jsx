export default function Layout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export function generateStaticParams() {
  return [{ lang: 'en' }]
}
