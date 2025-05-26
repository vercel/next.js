import { Suspense } from 'react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense>
      <html lang="en">
        <body>{children}</body>
      </html>
    </Suspense>
  )
}
