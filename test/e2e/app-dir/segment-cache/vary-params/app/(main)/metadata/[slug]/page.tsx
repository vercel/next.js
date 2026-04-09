type Params = { slug: string }

/**
 * Page where generateMetadata accesses params but the body does NOT.
 *
 * This tests that metadata param access is tracked separately from page body.
 * When the slug changes:
 * - Head segment should be re-fetched (metadata accesses slug)
 * - Body segment should be cached (body does NOT access slug)
 */
export async function generateStaticParams(): Promise<Params[]> {
  return [{ slug: 'aaa' }, { slug: 'bbb' }, { slug: 'ccc' }]
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  return { title: `Page: ${slug}` }
}

export default function MetadataPage() {
  // Intentionally NOT accessing params here - body should be cached
  return (
    <div id="metadata-page">
      <div data-content="true">{`Static page body`}</div>
    </div>
  )
}
