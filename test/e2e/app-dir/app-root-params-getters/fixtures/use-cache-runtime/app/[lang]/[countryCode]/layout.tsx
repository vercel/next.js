import { ReactNode } from 'react'

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}

export function generateStaticParams() {
  return [
    { lang: 'en', countryCode: 'us' },
    { lang: 'en', countryCode: 'gb' },
    { lang: 'fr', countryCode: 'ca' },
  ]
}
