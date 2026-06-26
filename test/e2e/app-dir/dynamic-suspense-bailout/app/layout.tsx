import { Suspense } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={<div id="root-fallback">Root Loading...</div>}>
          <div id="layout-content">{children}</div>
        </Suspense>
      </body>
    </html>
  )
}
