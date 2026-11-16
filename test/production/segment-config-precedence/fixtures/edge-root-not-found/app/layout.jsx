export const runtime = 'edge'

export default function Layout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
