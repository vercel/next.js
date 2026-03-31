import { Suspense } from 'react'
import { Nav } from '../components/nav'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Nav />
        <main>
          <Suspense fallback={<p>Loading...</p>}>{children}</Suspense>
        </main>
      </body>
    </html>
  )
}
