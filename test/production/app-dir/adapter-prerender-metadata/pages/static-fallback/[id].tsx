export function getStaticPaths() {
  return { paths: [], fallback: true }
}

export function getStaticProps({ params }) {
  return { props: { id: params.id } }
}

export default function Page({ id }) {
  return <p>static fallback {id}</p>
}
