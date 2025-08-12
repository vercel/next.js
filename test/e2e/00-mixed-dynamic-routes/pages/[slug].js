export default function Page(props) {
  return (
    <>
      <p>/[slug] page</p>
      <p>{JSON.stringify(props)}</p>
    </>
  )
}

export const getStaticProps = async ({ params }) => {
  return {
    props: {
      params,
      page: '[slug]',
      now: Date.now(),
    },
  }
}

export const getStaticPaths = async () => {
  return {
    paths: [
      { params: { slug: 'static-1' } },
      { params: { slug: 'static-2' } },
      { params: { slug: 'static-3' } },
    ],
    fallback: false,
  }
}
