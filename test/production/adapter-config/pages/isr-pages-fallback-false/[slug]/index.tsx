export function getStaticPaths() {
  return {
    paths: [
      {
        params: { slug: 'first' },
      },
      {
        params: { slug: 'second' },
      },
      {
        params: { slug: 'not-found' },
      },
    ],
    fallback: false,
  }
}

export function getStaticProps({ params }) {
  if (params.slug === 'not-found') {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      params,
      now: Date.now(),
    },
    revalidate:
      !process.env.TEST_EXPORT && params.slug === 'first' ? 60 : undefined,
  }
}

export default function Page(props) {
  return (
    <>
      <p>/isr-pages-fallback-false</p>
      <p>now: {Date.now()}</p>
      <p>{JSON.stringify(props)}</p>
    </>
  )
}
