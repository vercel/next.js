type Params = { slug?: string[] }

/**
 * Optional catch-all page that checks for the param using the `in` operator.
 *
 * Using `'slug' in params` should cause the segment to vary on the optional
 * catch-all param, even when the param has no value.
 */
export async function generateStaticParams(): Promise<Params[]> {
  return [{ slug: [] }, { slug: ['aaa'] }, { slug: ['bbb'] }]
}

export default async function OptionalCatchallHasPage({
  params,
}: {
  params: Promise<Params>
}) {
  const resolvedParams = await params
  const hasSlug = 'slug' in resolvedParams
  const slug = hasSlug ? resolvedParams.slug : undefined
  const slugDisplay = `Slug: ${slug ? slug.join('/') : 'none'}`
  return (
    <div id="optional-catchall-has-page">
      <div>{slugDisplay}</div>
    </div>
  )
}
