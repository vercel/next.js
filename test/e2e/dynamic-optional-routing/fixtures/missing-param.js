export async function getStaticPaths() {
  return { paths: [{ params: {} }], fallback: false }
}

export async function getStaticProps({ params }) {
  return { props: { params } }
}

export default function Index() {
  return <div>Invalid</div>
}
