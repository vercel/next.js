import * as Sentry from '@sentry/node'

export default async function handler(req, res) {
  try {
    throw new Error('API Test 4')
  } catch (error) {
    Sentry.captureException(error)
    await Sentry.flush(2000) // You must call flush before sending the reponse
  }

  res.statusCode = 200
  res.json({ name: 'John Doe' })
}
