import { ReactNode } from 'react'
import { Navbar } from './Navbar'
import { Providers } from './providers'

export const metadata = {
  title: 'route-race repro',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  )
}
