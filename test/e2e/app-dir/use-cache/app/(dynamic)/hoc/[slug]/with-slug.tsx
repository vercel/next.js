export function withSlug(
  Component: React.ComponentType<{ slug: string }>
): React.ComponentType<{ params: Promise<{ slug: string }> }> {
  return async function ComponentWithSlug(props: {
    params: Promise<{ slug: string }>
  }) {
    const params = await props.params
    const slug = params.slug

    return <Component slug={slug} />
  }
}
