import React, { Suspense } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PPR Bot SSG Bypass Test',
  description:
    'Test bot static generation bypass with PPR and cache components',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Suspense>{children}</Suspense>
      </body>
    </html>
  )
}
