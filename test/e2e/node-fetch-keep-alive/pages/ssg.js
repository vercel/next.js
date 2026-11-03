export default function SSG(props) {
  return <pre id="props">{JSON.stringify(props)}</pre>
}

export async function getStaticProps() {
  const res = await fetch(process.env.TEST_SERVER_URL)
  const props = await res.json()
  return { props }
}
