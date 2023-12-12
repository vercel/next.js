import React from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  )
}

export const dynamic = 'force-dynamic'
