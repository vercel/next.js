import { Suspense } from 'react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        <Suspense fallback={null}>{children}</Suspense>
      </body>
    </html>
  )
}
