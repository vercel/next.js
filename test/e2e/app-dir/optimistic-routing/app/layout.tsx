import { ReactNode, Suspense } from 'react'
import { ParamsHistory } from '../components/params-history'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense fallback={null}>
          <ParamsHistory />
        </Suspense>
        {children}
      </body>
    </html>
  )
}
