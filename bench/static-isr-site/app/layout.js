import './globals.css'
import { CartProvider } from '../components/client/cart'
import { SiteFooter, SiteHeader } from '../components/site'
import { getNavigation } from '../lib/data'

export const metadata = {
  metadataBase: new URL('https://bench-static-isr-site.example'),
  title: { default: 'Northfold Supply', template: '%s | Northfold Supply' },
  description: 'Durable goods for work and the outdoors.',
  openGraph: { siteName: 'Northfold Supply', type: 'website', locale: 'en_US' },
}

export default async function RootLayout({ children }) {
  const navigation = await getNavigation()
  return (
    <html lang="en">
      <body>
        <CartProvider currency="USD">
          <a className="skip-link" href="#content">
            Skip to content
          </a>
          <SiteHeader navigation={navigation} />
          <main id="content">{children}</main>
          <SiteFooter navigation={navigation} />
        </CartProvider>
      </body>
    </html>
  )
}
