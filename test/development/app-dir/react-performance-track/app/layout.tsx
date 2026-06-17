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
          <li>
            <Link href="/params/next">params</Link>
          </li>
          <li>
            <Link href="/searchparams?slug=next">searchParams</Link>
          </li>
          <li>
            <Link href="/headers">headers</Link>
          </li>
          <li>
            <Link href="/cookies">cookies</Link>
          </li>
          <li>
            <Link href="/draftMode">draftMode</Link>
          </li>
        </ul>
        <main>
          <Suspense fallback="Loading Server Requests">
            <div data-react-server-requests-done />
            {children}
          </Suspense>
          <ReactServerRequests />
        </main>
      </body>
    </html>
  )
}
