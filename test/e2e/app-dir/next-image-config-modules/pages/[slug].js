export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'worker-probe' } }],
    fallback: false,
  }
}

export async function getStaticProps({ params }) {
  return { props: { slug: params.slug } }
}

export default function WorkerProbe({ slug }) {
  return <p id="worker-probe">{slug}</p>
}
