import type { Metadata } from 'next'
import type React from 'react'
import './globals.css'
import MobileSwipeFix from '../components/MobileSwipeFix'

export const metadata: Metadata = {
  title: 'Next.js Bundle Analyzer',
  description:
    'Visualize and analyze your Next.js bundle sizes with interactive treemap and dependency analysis',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <MobileSwipeFix />
        {children}
      </body>
    </html>
  )
}
