export default async function TestPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params

  return (
    <div>
      <h1 id="test-page">App Router Test Page</h1>
      <p id="test-locale">{lang}</p>
      <p id="test-message">
        {lang === 'nl-NL'
          ? 'Dit is de Nederlandse versie'
          : 'This is the English version'}
      </p>
    </div>
  )
}
