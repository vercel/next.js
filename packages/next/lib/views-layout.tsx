import React from 'react'

export type LayoutProps = {
  children: any
}

export default function ViewsLayout({ children }: LayoutProps) {
  return (
    <html>
      <head>
        {/* TODO: Remove <title> */}
        <title>Test</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
