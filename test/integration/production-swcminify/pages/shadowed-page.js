export function getServerSideProps() {
  throw new Error('oops!')
}

export default function ShadowedPage() {
  return <div id="shadowed-page">Not routable!</div>
}
