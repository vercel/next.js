export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'fr' }]
}

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  )
}
