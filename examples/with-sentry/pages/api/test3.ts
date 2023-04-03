function work() {
  throw new Error('API Test 3')
}

export default function handler(req, res) {
  work()

  res.status(200).json({ name: 'John Doe' })
}
