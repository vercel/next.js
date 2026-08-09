export function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}

export function getStaticProps() {
  return {
    notFound: true,
    revalidate: 1,
  }
}

export default function PagesRoute() {
  return <p>This page should not render.</p>
}
