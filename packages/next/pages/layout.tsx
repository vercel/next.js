import React from 'react'

export type RootProps = {
  headChildren: any
  bodyChildren: any
}

export default function RootLayout({ headChildren, bodyChildren }: RootProps) {
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
