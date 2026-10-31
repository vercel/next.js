export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'prerendered' } }],
    fallback: true,
  }
}

export async function getStaticProps({ params }) {
  return { props: { slug: params.slug } }
}

export default function GspPage({ slug }) {
  return <div id="prop">{slug}</div>
}
