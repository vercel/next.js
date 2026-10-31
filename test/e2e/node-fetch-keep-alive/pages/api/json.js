export default async function handler(_req, res) {
  const fetchRes = await fetch(process.env.TEST_SERVER_URL)
  const props = await fetchRes.json()
  res.json(props)
}
