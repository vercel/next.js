export default function SSR(props) {
  return <pre id="props">{JSON.stringify(props)}</pre>
}

export async function getServerSideProps() {
  const res1 = await fetch('http://localhost:44001')
  const text1 = await res1.text()
  const connection1 = res1.headers.connection || ''
  const props = { text1, connection1 }
  return { props }
}
