export function getStaticPaths() {
  return { paths: [], fallback: true }
}

export function getStaticProps({ params }: { params: { id: string } }) {
  return { props: { id: params.id } }
}

export default function Page({ id }: { id: string }) {
  return <p>static fallback {id}</p>
}
