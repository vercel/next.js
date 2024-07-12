import { ReactNode } from 'react'
import { Inter } from 'next/font/google'

const inter = Inter({
  // Adding several subsets to ensure that lots of preloads are added to the
  // link header.
  subsets: ['latin', 'latin-ext', 'vietnamese', 'cyrillic'],
})

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
