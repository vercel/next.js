import React from 'react'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        Children: <div id="children">{children}</div>
      </body>
    </html>
  )
}
