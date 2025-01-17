import React from 'react'

export default function Root({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div id="slot">{slot}</div>
        <div id="children">{children}</div>
      </body>
    </html>
  )
}
