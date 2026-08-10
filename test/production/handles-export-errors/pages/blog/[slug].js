export default function Page() {
  throw new Error('oops')
}

export function getStaticProps() {
  return {
    props: {},
  }
}

export function getStaticPaths() {
  return {
    paths: ['/blog/first', '/blog/second'],
    fallback: false,
  }
}
