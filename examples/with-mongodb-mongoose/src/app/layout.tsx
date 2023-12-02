import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import '../css/style.css'
import { ReactNode } from 'react'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Nextjs with mongodb-mongoose',
  description: 'Nextjs with mongodb-mongoose',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="top-bar">
          <div className="nav">
            <Link href="/">Home</Link>
            <Link href="/new">Add Pet</Link>
          </div>

          <img
            id="title"
            src="https://upload.wikimedia.org/wikipedia/commons/1/1f/Pet_logo_with_flowers.png"
            alt="pet care logo"
          />
        </div>
        <div className="wrapper grid">{children}</div>
      </body>
    </html>
  )
}
