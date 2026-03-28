import { Suspense } from 'react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <Suspense fallback={<div id="loading">Loading...</div>}>
          {children}
        </Suspense>
      </body>
    </html>
  )
}
