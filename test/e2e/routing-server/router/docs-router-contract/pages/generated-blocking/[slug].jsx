export default function Page({ slug }) {
  return <p id="generated-path">generated-blocking:{slug}</p>
}

export function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export function getStaticProps({ params }) {
  return { props: { slug: params.slug } }
}
