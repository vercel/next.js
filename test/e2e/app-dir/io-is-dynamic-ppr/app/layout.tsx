// import { Suspense } from 'react'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <div id="layout">{process.env.__TEST_SENTINEL}</div>
      </body>
    </html>
  )
}
