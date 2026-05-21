import React from 'react'

export const metadata = {
  title: 'Debug Build Paths Test (src dir)',
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
