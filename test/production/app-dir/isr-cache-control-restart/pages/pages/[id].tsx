// Rendered on demand (nothing is prerendered) and cached for an hour.
export function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export function getStaticProps({ params }: { params: { id: string } }) {
  return { props: { id: params.id }, revalidate: 3600 }
}

export default function Page({ id }: { id: string }) {
  return <p id="page">page {id}</p>
}
