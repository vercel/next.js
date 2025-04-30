// This file will cause a build error
export default function StaticGoneAndNotFound() {
  return <h1>This page should not be rendered</h1>
}

export function getStaticProps() {
  return {
    notFound: true,
    gone: true,
    props: {},
  }
}
