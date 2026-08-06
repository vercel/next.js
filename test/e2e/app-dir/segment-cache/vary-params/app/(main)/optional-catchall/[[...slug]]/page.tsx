type Params = { slug?: string[] }

/**
 * Optional catch-all page that accesses params.slug directly.
 *
 * The [[...slug]] param may or may not be present. The page accesses it,
 * so the segment should vary on slug — including when it has no value.
 */
export async function generateStaticParams(): Promise<Params[]> {
  return [{ slug: [] }, { slug: ['aaa'] }, { slug: ['bbb'] }]
}

export default async function OptionalCatchallPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const slugDisplay = `Slug: ${slug ? slug.join('/') : 'none'}`
  return (
    <div id="optional-catchall-page">
      <div>{slugDisplay}</div>
    </div>
  )
}
