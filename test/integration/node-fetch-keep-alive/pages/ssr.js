export default function SSR(props) {
  return <pre id="props">{JSON.stringify(props)}</pre>
}

export async function getServerSideProps() {
  const res = await fetch('http://localhost:44001')
  const props = await res.json()
  return { props }
}
