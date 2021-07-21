export default async function handler(_req, res) {
  const res1 = await fetch('http://localhost:44001')
  const text1 = await res1.text()
  const connection1 = res1.headers.connection || ''
  const props = { text1, connection1 }
  res.json(props)
}
