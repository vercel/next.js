import React from 'react'

export default function Root({ parallel }: { parallel: React.ReactNode }) {
  return (
    <html>
      <body>
        <div id="children">{parallel}</div>
      </body>
    </html>
  )
}
