import { init } from '../../utils/sentry'

init()

function work() {
  throw new Error('API Test 2')
}

work()

export default async function handler(req, res) {
  res.status(200).json({ name: 'John Doe' })
}
