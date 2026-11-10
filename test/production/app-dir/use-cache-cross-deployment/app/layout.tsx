import { Suspense } from 'react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <head />
      <body>
        <Suspense>{children}</Suspense>
      </body>
    </html>
  )
}
