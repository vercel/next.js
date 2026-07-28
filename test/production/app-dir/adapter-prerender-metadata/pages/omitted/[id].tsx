export function getStaticPaths() {
  return {
    paths: [{ params: { id: 'a' } }],
    fallback: false,
  }
}

export function getStaticProps({ params }: { params: { id: string } }) {
  return { props: { id: params.id } }
}

export default function Page({ id }: { id: string }) {
  return <p>omitted {id}</p>
}
