export default async function ApiRoute(_req, res) {
  const port = process.env.NEXT_PUBLIC_API_PORT
  const response = await fetch(`http://localhost:${port}/`)
  const json = await response.json()
  res.json(json)
}
