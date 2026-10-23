import React from 'react'

export default function RootLayout({
  children,
  slot,
}: {
  children: React.ReactNode
  slot: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div id="children-container">{children}</div>
        <div id="slot-container">{slot}</div>
      </body>
    </html>
  )
}
