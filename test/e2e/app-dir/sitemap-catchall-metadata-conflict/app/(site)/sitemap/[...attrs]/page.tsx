export default async function HtmlSitemapPage({
  params,
}: {
  params: Promise<{ attrs: string[] }>
}) {
  const { attrs } = await params

  return (
    <main>
      <h1>HTML sitemap</h1>
      <p>Internal route attributes: {attrs.join('/')}</p>
    </main>
  )
}
