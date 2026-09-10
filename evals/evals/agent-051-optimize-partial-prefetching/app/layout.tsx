import type { ReactNode } from 'react'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav aria-label="Conference">
          <a href="/sessions">Sessions</a>
        </nav>
        {children}
      </body>
    </html>
  )
}
