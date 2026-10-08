export default function CatchAll() {
  return <p>Pages catch-all</p>
}

export function getStaticProps() {
  return { props: {} }
}

export function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}
