type Params = { slug?: string[] }

/**
 * Optional catch-all page that accesses params via enumeration (spread).
 *
 * Spreading the params object should cause the segment to vary on the
 * optional catch-all param, even when the param has no value.
 */
export async function generateStaticParams(): Promise<Params[]> {
  return [{ slug: [] }, { slug: ['aaa'] }, { slug: ['bbb'] }]
}

export default async function OptionalCatchallEnumerationPage({
  params,
}: {
  params: Promise<Params>
}) {
  const resolvedParams = await params
  const copied = { ...resolvedParams }
  const slugDisplay = `Slug: ${copied.slug ? copied.slug.join('/') : 'none'}`
  return (
    <div id="optional-catchall-enumeration-page">
      <div>{slugDisplay}</div>
    </div>
  )
}
