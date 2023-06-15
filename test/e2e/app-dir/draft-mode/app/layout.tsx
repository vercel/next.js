import React from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <head>
        <title>Draft Mode</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
