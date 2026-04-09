import React, { Suspense } from 'react'

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
        <Suspense>
          <div id="slot">{slot}</div>
        </Suspense>
        <Suspense>
          <div id="children">{children}</div>
        </Suspense>
      </body>
    </html>
  )
}
