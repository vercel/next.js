import * as React from 'react'

export default function Root({ children }) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  )
}
