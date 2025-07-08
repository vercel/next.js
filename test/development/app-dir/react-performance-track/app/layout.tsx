import { ReactNode, Suspense } from 'react'
import { ReactServerRequests } from './ReactServerRequests'
import Link from 'next/link'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
        <ul>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/fetch">fetch</Link>
          </li>
          <li>
            <Link href="/set-timeout">setTimeout</Link>
          </li>
        </ul>
        <main>
          <ReactServerRequests />
          <Suspense fallback="Loading Server Requests">
            <div data-react-server-requests-done />
            {children}
          </Suspense>
        </main>
      </body>
    </html>
  )
}
