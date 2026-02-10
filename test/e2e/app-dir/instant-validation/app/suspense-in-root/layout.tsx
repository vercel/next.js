import { connection } from 'next/server'
import { ReactNode, Suspense } from 'react'

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
      <a href="/">Home</a>{' '}
      <Suspense fallback="...">
        <div id="root-layout-timestamp">
          <Now />
        </div>
      </Suspense>
    </header>
  )
}

async function Now() {
  await connection()
  return Date.now()
}
