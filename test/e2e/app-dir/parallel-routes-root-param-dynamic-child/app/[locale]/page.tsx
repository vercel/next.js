export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return <div id="locale-page">Locale: {locale}</div>
}
