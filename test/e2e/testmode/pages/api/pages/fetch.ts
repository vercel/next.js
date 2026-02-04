export default async function handler(req, res) {
  const text = await (await fetch('https://example.com')).text()
  res.status(200).json({ text })
}
