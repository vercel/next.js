export default function Page(props) {
  return (
    <>
      <p>/dynamic/[slug]</p>
      <p>{JSON.stringify(props)}</p>
    </>
  )
}

export function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'first' } }],
    fallback: 'blocking',
  }
}

export function getStaticProps({ params }) {
  return {
    props: {
      params,
      now: Date.now(),
    },
  }
}
