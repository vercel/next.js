import { connection } from 'next/server'
import { ReactNode, Suspense } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body style={{ fontFamily: 'monospace' }}>
        <Header />
        <hr />
        {children}
      </body>
    </html>
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
