export default function DynamicPage() {
  return <h1 id="dynamic-page-header">Dynamic Page</h1>
}

export async function getServerSideProps() {
  return { props: {} }
}
