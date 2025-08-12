export default function Page(props) {
  return (
    <>
      <p id="page">blog slug</p>
      <p id="slug">{props.slug}</p>
    </>
  )
}

export function getStaticProps({ params }) {
  const result =
    params?.slug === 'awesome'
      ? { props: { slug: params?.slug } }
      : { notFound: true }

  return result
}

export function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'awesome' } }],
    fallback: false,
  }
}
