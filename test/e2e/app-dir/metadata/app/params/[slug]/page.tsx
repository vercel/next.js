function format({ params, searchParams }) {
  const { slug } = params
  const { q } = searchParams
  return `params - ${slug}${q ? ` query - ${q}` : ''}`
}

export default function page(props) {
  return <p>{format(props)}</p>
}

export function generateMetadata(props) {
  return {
    title: format(props),
  }
}
