export default function Page(props) {
  return (
    <>
      <p>hello from /nested/blog-fallback-false/[slug]</p>
    </>
  )
}

export function getStaticProps() {
  return {
    props: {
      now: Date.now(),
    },
  }
}

export function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'first' } }],
    fallback: false,
  }
}
