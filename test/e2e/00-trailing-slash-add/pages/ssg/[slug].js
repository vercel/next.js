export default function Page(props) {
  return (
    <>
      <p>/ssg/[slug]</p>
      <p>{JSON.stringify(props)}</p>
    </>
  )
}

export function getStaticProps() {
  return {
    notFound: true,
  }
}

export function getStaticPaths() {
  return {
    paths: ['/ssg/first', '/ssg/second'],
    fallback: 'blocking',
  }
}
