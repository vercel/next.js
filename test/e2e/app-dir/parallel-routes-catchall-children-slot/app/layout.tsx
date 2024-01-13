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
        <div id="children">{children}</div>
        <div id="slot">{slot}</div>
      </body>
    </html>
  )
}
