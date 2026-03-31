import React from 'react'

export default function Root({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <html>
      <body>
        <div id="children">{children}</div>
        <div id="slot">{modal}</div>
      </body>
    </html>
  )
}
