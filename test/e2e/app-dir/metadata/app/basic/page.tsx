import React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import Client from './client'

export default function Page() {
  return (
    <div id="basic">
      <Link id="to-index" href="/">
        to index
      </Link>
      <br />
      <Link href="/title-template/extra/inner" id="to-nested">
        to /title-template/extra/inner
      </Link>
      <Client />
    </div>
  )
}

export const metadata: Metadata = {
  generator: 'next.js',
  applicationName: 'test',
  referrer: 'origin-when-cross-origin',
  keywords: ['next.js', 'react', 'javascript'],
  authors: [{ name: 'huozhi' }, { name: 'tree', url: 'https://tree.com' }],
  manifest: '/api/manifest',
  creator: 'shu',
  publisher: 'vercel',
  robots: 'index, follow',
  alternates: {},
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
}

export const viewport = {
  // viewport meta tag
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  interactiveWidget: 'resizes-visual',
  // visual meta tags
  colorScheme: 'dark',
  themeColor: { color: 'cyan', media: '(prefers-color-scheme: dark)' },
}
