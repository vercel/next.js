import { ReactNode } from 'react'

export async function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
