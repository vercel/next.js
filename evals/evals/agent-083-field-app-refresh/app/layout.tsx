import Link from 'next/link'
import { OfflineReady } from './offline-ready'
import { APP_SHELL_VERSION } from '@/lib/version'

export const metadata = { title: 'FieldKit Dispatch' }

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Home</Link> <Link href="/jobs">Jobs</Link>
        </nav>
        {children}
        <footer>shell {APP_SHELL_VERSION}</footer>
        <OfflineReady />
      </body>
    </html>
  )
}
