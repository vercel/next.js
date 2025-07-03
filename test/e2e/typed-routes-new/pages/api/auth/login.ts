export default function handler(req: any, res: any) {
  if (req.method === 'POST') {
    const { username, password } = req.body

    if (username && password) {
      res.status(200).json({
        success: true,
        token: 'mock-token',
        user: { username },
      })
    } else {
      res.status(400).json({ message: 'Missing credentials' })
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' })
  }
}
