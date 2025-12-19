export function withSlug(
  Component: React.ComponentType<{ slug: string }>
): // TODO(NXT-127): Use ComponentType
React.JSXElementConstructor<{ params: Promise<{ slug: string }> }> {
  return async function ComponentWithSlug(props: {
    params: Promise<{ slug: string }>
  }) {
    const params = await props.params
    const slug = params.slug

    return <Component slug={slug} />
  }
}
