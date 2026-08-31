import type { Metadata } from 'next'
import './globals.css'
import { LayoutSpinner } from './Spinner'

export const metadata: Metadata = {
  title: 'Team directory',
  description: 'Company team directory',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <LayoutSpinner />
        {children}
      </body>
    </html>
  )
}
