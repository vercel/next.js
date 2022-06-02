import * as Sentry from '@sentry/nextjs'

async function handler(req, res) {
  try {
    throw new Error('API Test 4')
  } catch (error) {
    Sentry.captureException(error)
  }

  // Flushing before returning is necessary if deploying to Vercel, see
  // https://vercel.com/docs/platform/limits#streaming-responses
  await Sentry.flush(2000)
  res.status(200).json({ name: 'John Doe' })
}

export default Sentry.withSentry(handler)
