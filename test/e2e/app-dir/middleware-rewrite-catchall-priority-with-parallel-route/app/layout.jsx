import React from 'react'

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <title>Test App</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
