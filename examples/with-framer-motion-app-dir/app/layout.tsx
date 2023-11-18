import Link from 'next/link'
import React from 'react'

export default function RootLayout({
  children,
  sidebar,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <nav style={{ display: 'flex', gap: '1em' }}>
          <p>
            <Link href="/">Home</Link>
          </p>
          <p>
            <Link href="/hi3">Hi3</Link>
          </p>
          <p>
            <Link href="/hi3/sub">Hi3 sub</Link>
          </p>
          <hr />
          <p>
            <Link href="/hi4">Hi4</Link>
          </p>
          <p>
            <Link href="/hi4/sub">Hi4 sub</Link>
          </p>
          <p>
            <Link href="/hi4/sub2">Hi4 sub2</Link>
          </p>
        </nav>
        <main style={{ display: 'flex', width: '100vw', gap: '1em' }}>
          <div style={{ flex: '1' }}>
            <h1>CHILDREN</h1>
            {children}
          </div>
          <div style={{ flex: '1' }}>
            <h1>SIDEBAR</h1>
            {sidebar}
          </div>
        </main>
      </body>
    </html>
  )
}
