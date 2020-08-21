function work() {
  throw new Error('API Test 2')
}

work()

export default function handler(req, res) {
  res.statusCode = 200
  res.json({ name: 'John Doe' })
}
