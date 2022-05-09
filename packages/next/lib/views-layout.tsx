import React from 'react'

export type LayoutProps = {
  headChildren: any
  bodyChildren: any
}

export default function ViewsLayout({
  headChildren,
  bodyChildren,
}: LayoutProps) {
  return (
    <html>
      <head>
        {headChildren}
        <title>Test</title>
      </head>
      <body>{bodyChildren}</body>
    </html>
  )
}
