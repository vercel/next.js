import React from 'react'

export default function AppLayout({ children }) {
  return (
    <html>
      <head>
        <title>RSC</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
