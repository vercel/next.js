export default () => 'Hello World'

export function getStaticProps() {
  return { props: {} }
}

export function getStaticPaths() {
  return { paths: [], fallback: true }
}
