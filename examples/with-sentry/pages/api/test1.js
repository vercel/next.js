import { init } from '../../utils/sentry'

init()

const doAsyncWork = () => Promise.reject(new Error('API Test 1'))
doAsyncWork()

export default async function handler(req, res) {
  res.statusCode = 200
  res.json({ name: 'John Doe' })
}
