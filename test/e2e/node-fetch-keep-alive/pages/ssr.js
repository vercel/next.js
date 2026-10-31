export default function SSR(props) {
  return <pre id="props">{JSON.stringify(props)}</pre>
}

export async function getServerSideProps() {
  const res = await fetch(process.env.TEST_SERVER_URL)
  const props = await res.json()
  return { props }
}
