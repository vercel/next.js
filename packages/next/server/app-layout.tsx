import React from 'react'

export default function Root({ children }: { children: any }) {
  return (
    <html>
      <head />
      <body>{children}</body>
    </html>
  )
}
