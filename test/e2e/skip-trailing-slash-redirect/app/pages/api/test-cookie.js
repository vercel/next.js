export default function handler(req, res) {
  console.log('setting cookie in api route')
  res.setHeader('Set-Cookie', 'hello=From API')
  res.status(200).json({ name: 'API' })
}
