export default function handler(req, res) {
  return res.json({ hello: 'world' })
}

export const config = {
  maxDuration: 7,
}
