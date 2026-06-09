export const dynamic = 'force-dynamic'

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
    </div>
  )
}
