import { Suspense, type ReactNode } from 'react'
import { readContent } from './read-content'

export default async function Root({ children }: { children: ReactNode }) {
  const content = await readContent('layout')
  return (
    <html>
      <body>
        <p id="layout-content">{content}</p>
        <Suspense fallback={<p>Loading page</p>}>{children}</Suspense>
      </body>
    </html>
  )
}
