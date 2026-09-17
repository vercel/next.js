import React from 'react'

export const metadata = {
  title: 'PPR Bot Cache Test',
  description: 'Testing static shell caching for search crawlers',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
