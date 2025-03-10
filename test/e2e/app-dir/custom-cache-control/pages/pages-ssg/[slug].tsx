export function getStaticProps({ params }) {
  return {
    props: {
      now: Date.now(),
      params,
    },
    revalidate: 120,
  }
}

export function getStaticPaths() {
  return {
    paths: [
      {
        params: { slug: 'first' },
      },
    ],
    fallback: 'blocking',
  }
}

export default function Page({ params }) {
  return (
    <>
      <p>/pages-ssg/[slug]</p>
      <p>{JSON.stringify(params)}</p>
    </>
  )
}
