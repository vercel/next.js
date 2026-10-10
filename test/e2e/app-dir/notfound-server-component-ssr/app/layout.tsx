import type { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/test.css" />
      </head>
      <body>
        <div id="layout-marker">root-layout</div>
        {children}
      </body>
    </html>
  )
}
