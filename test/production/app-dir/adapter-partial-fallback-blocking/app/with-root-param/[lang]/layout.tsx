// The ROOT layout lives inside [lang], making `lang` a ROOT param: the
// document itself (the html tag) varies by lang with no Suspense boundary.
// Root params must be provided by every generateStaticParams result — the
// build enforces this — so `lang` is always a prerenderable param.
export default async function RootLayout({
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
