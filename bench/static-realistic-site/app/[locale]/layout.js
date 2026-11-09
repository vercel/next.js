import '../globals.css'
import { getSite, read } from '@bench/data'
import { CartProvider } from '../../components/client/shell'
import { SiteFooter, SiteHeader } from '../../components/site'
import { ALL_LOCALES, locales } from '../../lib/content.mjs'

export function generateStaticParams() {
  return locales().map((locale) => ({ locale }))
}

export async function generateMetadata({ params }) {
  const { locale } = await read(params)
  const site = await getSite(locale)
  return {
    metadataBase: new URL('https://bench-static-realistic-site.example'),
    title: { default: site.name, template: `%s | ${site.name}` },
    description: site.tagline,
    alternates: {
      languages: Object.fromEntries(ALL_LOCALES.map((l) => [l, `/${l}`])),
    },
    openGraph: { siteName: site.name, type: 'website', locale },
    twitter: { card: 'summary_large_image', site: '@northfold' },
  }
}

export default async function RootLayout({ children, params }) {
  const { locale } = await read(params)
  const site = await getSite(locale)
  return (
    <html lang={locale}>
      <body>
        <CartProvider currency={site.currency}>
          <a className="skip-link" href="#content">
            Skip to content
          </a>
          <SiteHeader site={site} />
          <main id="content">{children}</main>
          <SiteFooter site={site} />
        </CartProvider>
      </body>
    </html>
  )
}
