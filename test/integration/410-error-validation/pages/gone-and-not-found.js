export default function GoneAndNotFound() {
  return <h1>This page should not be rendered</h1>
}

export function getServerSideProps() {
  return {
    notFound: true,
    gone: true,
  }
}
