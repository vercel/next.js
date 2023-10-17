import React from 'react'

export default function Layout({
  children,
}: {
  children: React.ReactNode
  params: {}
}) {
  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  )
}
