import React from 'react'
export default function RootLayout({
  children,
}: {
  children: import('react').ReactNode
}) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
