import { ReactNode } from 'react'
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <p>
          <a href="/target-page">MPA Link</a>
        </p>
        <main>{children}</main>
      </body>
    </html>
  )
}
