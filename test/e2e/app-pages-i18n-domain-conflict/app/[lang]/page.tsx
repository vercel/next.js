export default function RootPage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  return (
    <div>
      <h1 id="app-root">App Router Root</h1>
      <p id="locale">Locale: {params.then((p) => p.lang)}</p>
    </div>
  )
}
