import { notFound } from 'next/navigation'

export default async function Layout({ children, params }) {
  const { locale } = await params
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
    notFound()
  }
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
