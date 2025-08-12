export default function Page() {
  return <p>dynamic pages page</p>
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
    paths: [{ params: { slug: 'first' } }, { params: { slug: 'second' } }],
    fallback: 'blocking',
  }
}
