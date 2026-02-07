async function format({ params, searchParams }) {
  const { slug } = await params
  const { q } = await searchParams
  return `params - ${slug}${q ? ` query - ${q}` : ''}`
}

export default async function page(props) {
  return <p>{await format(props)}</p>
}

export async function generateMetadata(props, parent) {
  const parentMetadata = await parent
  /* mutating */
  return {
    ...parentMetadata,
    title: await format(props),
    keywords: parentMetadata.keywords.concat(['child']),
  }
}
