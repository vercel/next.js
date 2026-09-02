export default function Page() {
  return 'dynamic page'
}

export function getStaticProps() {
  return { props: {} }
}

export function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'first' } }],
    fallback: false,
  }
}
