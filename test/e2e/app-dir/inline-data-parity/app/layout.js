// The inline data channel applies to dynamic renders; prerendered pages
// serve build-time HTML and never hit it.
export const dynamic = 'force-dynamic'

export default function Layout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
