import React from 'next/dist/compiled/react'

export default function DefaultLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
