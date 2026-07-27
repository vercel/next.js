export default function handler(req, res) {
  res.setHeader('vary', 'Custom-Header')
  res.status(200).json({ message: 'Hello World' })
}
