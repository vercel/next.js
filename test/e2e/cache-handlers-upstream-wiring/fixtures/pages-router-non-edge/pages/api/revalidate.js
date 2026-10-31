export default async function handler(req, res) {
  await res.revalidate('/isr')
  return res.status(200).json({ revalidated: true })
}
