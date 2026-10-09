export default async function Layout({ children, params }) {
  const { locale } = await params
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  )
}
