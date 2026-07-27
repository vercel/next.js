import { Suspense } from 'react'

export default function Layout({ children, slot }) {
  return (
    <html lang="en">
      <head />
      <body>
        <Suspense>
          <div id="children-slot">{children}</div>
          <div id="slot-slot">{slot}</div>
        </Suspense>
      </body>
    </html>
  )
}
