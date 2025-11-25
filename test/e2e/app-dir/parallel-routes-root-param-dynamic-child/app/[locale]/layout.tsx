import type { ReactNode } from 'react'
import Navigation from './layout.client'

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'fr' }]
}

export const dynamicParams = false

export default function RootLayout({
  children,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  return (
    <html>
      <head>
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
      </head>
      <body className="p-2 flex flex-col gap-2 text-sm">
        <Navigation />
        {children}
      </body>
    </html>
  )
}
