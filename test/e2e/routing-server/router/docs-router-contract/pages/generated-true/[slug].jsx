export default function Page({ slug }) {
  return <p id="generated-path">generated-true:{slug}</p>
}

export function getStaticPaths() {
  return { paths: [], fallback: true }
}

export function getStaticProps({ params }) {
  return { props: { slug: params.slug } }
}
