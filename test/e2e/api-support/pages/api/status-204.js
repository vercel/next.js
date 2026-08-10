export default function handler(req, res) {
  if (req.query.invalid) {
    // test the warning when content is added for a 204 response
    return res.status(204).json({ hello: 'world' })
  }
  return res.status(204).send()
}
