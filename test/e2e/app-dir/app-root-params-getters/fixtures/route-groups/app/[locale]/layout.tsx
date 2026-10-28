import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>Locale Root: {children}</body>
    </html>
  )
}

export async function generateStaticParams() {
  return [{ locale: 'en' }]
}
