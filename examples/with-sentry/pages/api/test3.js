import { init } from '../../utils/sentry'

init()

function work() {
  throw new Error('API Test 3')
}

export default async function handler(req, res) {
  work()

  res.statusCode = 200
  res.json({ name: 'John Doe' })
}
