export function withSlug<P extends { params: Promise<{ slug: string }> }>(
  Component: React.ComponentType<{ slug: string }>
): React.ComponentType<{ params: Promise<{ slug: string }> }> {
  return async function ComponentWithSlug(props: P) {
    const params = await props.params
    const slug = params.slug

    return <Component slug={slug} />
  }
}
