import { init } from '../../utils/sentry'

init()

const doAsyncWork = () => Promise.reject(new Error('API Test 1'))
doAsyncWork()

export default async function handler(req, res) {
  res.status(200).json({ name: 'John Doe' })
}
