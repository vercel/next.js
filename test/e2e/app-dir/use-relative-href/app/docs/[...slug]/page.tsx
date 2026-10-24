import { RelativeHrefs } from '../../relative-hrefs'

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return (
    <>
      <div id="docs-page-slug">{slug.join('/')}</div>
      <RelativeHrefs id="docs-page-hrefs" targets={['/docs', '/']} />
    </>
  )
}
