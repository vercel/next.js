import { Suspense } from 'react'

export default function Layout({ children }: any) {
  return (
    <Suspense
      fallback={
        <html>
          <body />
        </html>
      }
    >
      <html
        style={{
          overflowY: 'scroll',
        }}
      >
        <head />
        <body style={{ margin: 0 }}>{children}</body>
      </html>
    </Suspense>
  )
}
