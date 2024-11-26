import { locales } from '../../components/page'

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function Layout(props) {
  const params = await props.params

  const { locale } = params

  const { children } = props

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
