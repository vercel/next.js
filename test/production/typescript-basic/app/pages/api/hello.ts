export const config = {
  runtime: 'nodejs',
}

export default function handler(req, res) {
  res.json({ hello: 'world' })
}
