import { Suspense } from 'react'

export default function RootLayout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Suspense>
          <div id="children-slot">{children}</div>
          <div id="parallel-slot">{slot}</div>
        </Suspense>
      </body>
    </html>
  )
}
