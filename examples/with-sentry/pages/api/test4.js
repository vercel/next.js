import * as Sentry from '@sentry/nextjs'

export default function handler(req, res) {
  try {
    throw new Error('API Test 4')
  } catch (error) {
    Sentry.captureException(error)
  }

  res.status(200).json({ name: 'John Doe' })
}
