import { connection } from 'next/server'

export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  await connection()

  return (
    <h1 id="team-page" data-locale={locale}>
      Team: {locale}
    </h1>
  )
}
