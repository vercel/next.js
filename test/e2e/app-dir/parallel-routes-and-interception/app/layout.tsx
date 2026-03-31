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
        {children}
        {slot}
      </body>
    </html>
  )
}
