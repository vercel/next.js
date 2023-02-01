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

export const metadata = {
  generator: 'next.js',
  applicationName: 'test',
  referrer: 'origin-when-crossorigin',
  keywords: ['next.js', 'react', 'javascript'],
  authors: ['John Doe', 'Jane Doe'],
  themeColor: 'cyan',
  colorScheme: 'dark',
  viewport: 'width=device-width, initial-scale=1, shrink-to-fit=no',
  creator: 'shu',
  publisher: 'vercel',
  robots: 'index, follow',
  alternates: {},
  formatDetection: {
    email: 'no',
    address: 'no',
    telephone: 'no',
  },
}
