import type { ReactNode } from 'react'

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <h1>Language-independent shell</h1>
        {children}
      </body>
    </html>
  )
}
