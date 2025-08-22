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
        <div id="slot">
          <Suspense>{slot}</Suspense>
        </div>
        <div id="children">
          <Suspense>{children}</Suspense>
        </div>
      </body>
    </html>
  )
}
