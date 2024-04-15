import React from 'react'

export const dynamic = 'force-dynamic'

export default function Layout({ children }) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  )
}
