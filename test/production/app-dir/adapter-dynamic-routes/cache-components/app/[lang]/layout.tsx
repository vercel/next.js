import { lang } from 'next/root-params'

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'de' }]
}

export default async function Root({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang={await lang()}>
      <body>{children}</body>
    </html>
  )
}
