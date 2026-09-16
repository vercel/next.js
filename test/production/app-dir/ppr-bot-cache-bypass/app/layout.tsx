import React from 'react'

export const metadata = {
  title: 'PPR Bot Cache E2E',
  description: 'Testing static shell caching for search bots',
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
