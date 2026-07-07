export default async function handler(_req, res) {
  const fetchRes = await fetch('http://localhost:44001')
  const props = await fetchRes.json()
  res.json(props)
}
