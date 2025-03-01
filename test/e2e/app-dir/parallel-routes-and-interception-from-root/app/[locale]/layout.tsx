export const runtime = 'edge'

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const locale = (await params).locale
  console.log('RootLayout rendered, locale:', locale)

  return (
    <html lang={locale}>
      <body>
        <p>Locale: {locale}</p>
        {children}
      </body>
    </html>
  )
}
