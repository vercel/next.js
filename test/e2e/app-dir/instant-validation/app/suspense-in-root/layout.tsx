import { ReactNode, Suspense } from 'react'
import { RootLayoutTimestamp } from '../shared'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // We're mostly interested in checking client navigations,
    // so to avoid having to give each test case a valid static shell,
    // we put a Suspense above the body.
    <Suspense fallback={<div>Root suspense boundary...</div>}>
      <html>
        <body style={{ fontFamily: 'monospace' }}>
          <Header />
          <hr />
          {children}
        </body>
      </html>
    </Suspense>
  )
}

function Header() {
  return (
    <header>
      <a href="/">Home</a>
      <RootLayoutTimestamp />
    </header>
  )
}
