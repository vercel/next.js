export default async function HtmlSitemapPage({
  params,
}: {
  params: Promise<{ attrs: string[] }>
}) {
  const { attrs } = await params

  return <p>{`html sitemap: ${attrs.join('/')}`}</p>
}
