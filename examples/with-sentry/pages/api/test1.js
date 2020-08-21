const doAsyncWork = () => Promise.reject(new Error('API Test 1'))
doAsyncWork()

export default function handler(req, res) {
  res.statusCode = 200
  res.json({ name: 'John Doe' })
}
