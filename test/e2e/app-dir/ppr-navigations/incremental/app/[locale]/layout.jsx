import { locales } from '../../components/page'

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default function Layout({ children, params: { locale } }) {
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
