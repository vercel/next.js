import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <header>agent-routes-test</header>
        {children}
      </body>
    </html>
  )
}
