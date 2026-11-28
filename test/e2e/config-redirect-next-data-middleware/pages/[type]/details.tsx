export default function Details({ routeType }: { routeType: string }) {
  return <p id="route-type">{routeType}</p>
}

export async function getStaticProps({ params }: { params: { type: string } }) {
  return { props: { routeType: params.type } }
}

export async function getStaticPaths() {
  return { paths: [{ params: { type: 'foo' } }], fallback: false }
}
