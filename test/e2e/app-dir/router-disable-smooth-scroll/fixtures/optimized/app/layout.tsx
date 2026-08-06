import React from 'react'
import './global.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html data-scroll-behavior="smooth">
      <head></head>
      <body>{children}</body>
    </html>
  )
}
