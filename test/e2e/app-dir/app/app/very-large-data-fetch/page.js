export default async function Home() {
  const res = await fetch('http://localhost:3000/api/large-data')
  const resClone = res.clone()
  const json = await resClone.json()
  return <pre id="done">{JSON.stringify(json, null, ' ')}</pre>
}
