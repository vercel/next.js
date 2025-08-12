export default function Page(props) {
  return (
    <>
      <p>build-time-not-found</p>
      <p>{JSON.stringify(props)}</p>
    </>
  )
}

export function getStaticPaths() {
  return {
    paths: ['/build-time-not-found/first', '/build-time-not-found/second'],
    fallback: 'blocking',
  }
}

export function getStaticProps({ params }) {
  console.log('getStaticProps', params)
  if (params.slug === 'first') {
    return {
      notFound: true,
    }
  }
  return {
    props: {
      params,
      now: Date.now(),
    },
  }
}
