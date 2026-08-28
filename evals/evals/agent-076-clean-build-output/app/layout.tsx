import type { ReactNode } from 'react'

export const metadata = {
  title: 'Fastlane Status',
  description: 'Live service status for Fastlane',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
