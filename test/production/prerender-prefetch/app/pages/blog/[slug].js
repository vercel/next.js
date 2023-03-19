export default function Page(props) {
  return (
    <>
      <p id="page">blog/[slug]</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export function getStaticProps({ params }) {
  console.log('revalidating /blog', params.slug)
  return {
    props: {
      params,
      now: Date.now(),
    },
    revalidate: 2,
  }
}

export function getStaticPaths() {
  return {
    paths: ['/blog/first', '/blog/second'],
    fallback: false,
  }
}
