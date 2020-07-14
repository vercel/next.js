export async function getServerSideProps({ query: { slug } }) {
  return { props: { slug: slug || [] } }
}

export default function Page({ slug }) {
  return <div>{slug.join('/')}</div>
}
