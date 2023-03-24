import { Suspense } from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <head></head>
      <body>
        <Suspense fallback={<div>loading...</div>}>{children}</Suspense>
      </body>
    </html>
  )
}

export const metadata = {
  title: 'this is the layout title',
  description: 'this is the layout description',
}
