export default function Layout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export const dynamic = 'force-dynamic'
