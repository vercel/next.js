import type { Metadata } from 'next'
import Link from 'next/link'

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
    </div>
  )
}

export const metadata: Metadata = {
  generator: 'next.js',
  applicationName: 'test',
  referrer: 'origin-when-cross-origin',
  keywords: ['next.js', 'react', 'javascript'],
  authors: [{ name: 'huozhi' }, { name: 'tree', url: 'https://tree.com' }],
  themeColor: { color: 'cyan', media: '(prefers-color-scheme: dark)' },
  colorScheme: 'dark',
  manifest: 'https://github.com/manifest.json',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    interactiveWidget: 'resizes-visual',
  },
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
