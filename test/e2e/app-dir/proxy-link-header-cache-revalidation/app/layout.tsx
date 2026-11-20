'use cache'

import { cacheLife } from 'next/cache'

import { inter } from './fonts'

type RootLayoutProps = {
  children: React.ReactNode
}

export default async function RootLayout({ children }: RootLayoutProps) {
  cacheLife('max')

  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
