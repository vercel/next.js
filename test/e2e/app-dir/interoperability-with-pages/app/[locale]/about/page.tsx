export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  return (
    <main id="app-about-page">
      <h1>App Router About</h1>
      <p>Locale: {locale}</p>
    </main>
  )
}
