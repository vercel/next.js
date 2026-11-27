import { Suspense, type ReactNode } from 'react'
import { PathnameView } from '../components/pathname-view'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={null}>
          <PathnameView />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
