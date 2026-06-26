export const runtime = 'edge'

export default function Root({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
