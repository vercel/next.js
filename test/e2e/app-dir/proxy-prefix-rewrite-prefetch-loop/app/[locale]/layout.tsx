import { locale } from 'next/root-params'

export function generateStaticParams() {
  return [{ locale: 'en' }]
}

export default async function RootLayout({
  children,
}: LayoutProps<'/[locale]'>) {
  // An i18n library reads the locale root param to pick up the active locale
  // (e.g. next-intl's getRequestConfig). Without this read the param is
  // unused and the bug does not reproduce.
  const activeLocale = await locale()

  return (
    <html lang={activeLocale}>
      <body>{children}</body>
    </html>
  )
}
