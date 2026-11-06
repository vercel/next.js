export default function PagesDocs() {
  return <div id="pages-docs">PAGES DOCS PAGE</div>
}

// Server-side delay so that any transient client-side misprediction
// stays observable: the corrective navigation cannot complete faster
// than this.
export async function getServerSideProps() {
  await new Promise((resolve) => setTimeout(resolve, 500))
  return { props: {} }
}
