import { Instant } from 'next'
import { RootLayoutTimestamp } from '../../../shared'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { lang: 'en' } }],
}

export async function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default async function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html>
      <body>
        <RootLayoutTimestamp />
        <hr />
        {children}
      </body>
    </html>
  )
}
