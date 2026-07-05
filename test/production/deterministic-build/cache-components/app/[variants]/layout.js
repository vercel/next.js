import { Suspense } from 'react'

import { Geist } from 'next/font/google'
import './styles.css'

import { Client } from './client'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export default async function DynamicRootLayout(props) {
  await props.params
  return (
    <html>
      <head>
        <Suspense>
          <meta />
        </Suspense>
      </head>
      <body className={geistSans.variable}>
        <Client>{props.children}</Client>
      </body>
    </html>
  )
}

export function generateStaticParams() {
  return [{ variants: 'abc' }]
}
