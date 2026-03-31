import React from 'react'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <div id="children">{children}</div>
      </body>
    </html>
  )
}
