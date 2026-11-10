import { ReactNode } from 'react'
import { RootLayoutTimestamp } from '../shared'

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
      <a href="/">Home</a>
      <RootLayoutTimestamp />
    </header>
  )
}
