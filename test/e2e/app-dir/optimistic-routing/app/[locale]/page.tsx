import { connection } from 'next/server'

export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  await connection()

  return (
    <h1 id="locale-page" data-locale={locale}>
      Locale: {locale}
    </h1>
  )
}
