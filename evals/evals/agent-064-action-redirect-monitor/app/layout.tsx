import type { ReactNode } from 'react'

export const metadata = {
  title: 'Northwind Careers',
  description: 'Apply to join the Northwind team',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          maxWidth: 640,
          margin: '0 auto',
          padding: '4rem 1.5rem',
          lineHeight: 1.6,
        }}
      >
        {children}
      </body>
    </html>
  )
}
